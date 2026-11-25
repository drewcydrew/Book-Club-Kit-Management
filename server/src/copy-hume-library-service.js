const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SOURCE_ID = 'hume';
const MAX_NAME_LENGTH = 200;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const TEXT_TYPES = new Set(['text', 'character varying']);
const UNSHARED_TABLES = new Set(['library_services', 'schema_migrations']);
// Some databases have these links without foreign keys. Without them the copy would not remap the columns, and copied rows would collide with Hume's primary keys.
const IMPLIED_FOREIGN_KEYS = [
  { child_table: 'kit_label_assignments', child_column: 'kit_id', parent_table: 'kits', parent_column: 'id' },
  { child_table: 'kit_label_assignments', child_column: 'label_id', parent_table: 'kit_labels', parent_column: 'id' },
];

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normaliseName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Library service name must be 1-${MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

async function assertMigrationsApplied(client) {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((name) => /^\d+.*\.sql$/.test(name));
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
  const pending = files.filter((name) => !applied.has(name));
  if (pending.length) throw new Error(`Apply pending migrations before copying: ${pending.join(', ')}`);
}

async function readSchema(client) {
  const columnRows = (await client.query(`
    SELECT c.relname AS table_name, a.attname AS column_name, a.atttypid::regtype::text AS data_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind = 'r' AND n.nspname = current_schema()
    ORDER BY c.relname, a.attnum`)).rows;
  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
    columnsByTable.get(row.table_name).set(row.column_name, row.data_type);
  }

  // Single-column primary keys and unique constraints; library_service_id is excluded because it is overridden per copy.
  const singleKeys = (await client.query(`
    SELECT cc.relname AS table_name, a.attname AS column_name, con.contype AS kind
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cc.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE con.contype IN ('p', 'u') AND cardinality(con.conkey) = 1
      AND a.attname <> 'library_service_id' AND n.nspname = current_schema()`)).rows;

  const foreignKeys = (await client.query(`
    SELECT cc.relname AS child_table, ca.attname AS child_column,
           pc.relname AS parent_table, pa.attname AS parent_column
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = cc.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(child_attnum, parent_attnum)
    JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k.child_attnum
    JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.parent_attnum
    WHERE con.contype = 'f' AND n.nspname = current_schema()`)).rows;

  return { columnsByTable, singleKeys, foreignKeys };
}

// Decides which tables are copied, in what order, and how identifiers are remapped.
function planCopy(schema) {
  const { columnsByTable, singleKeys } = schema;
  const foreignKeys = [
    ...schema.foreignKeys,
    ...IMPLIED_FOREIGN_KEYS.filter((implied) => !schema.foreignKeys.some((fk) =>
      fk.child_table === implied.child_table && fk.child_column === implied.child_column)),
  ];
  const scoped = new Set([...columnsByTable.keys()].filter((table) =>
    columnsByTable.get(table).has('library_service_id') && !UNSHARED_TABLES.has(table)));

  // Unscoped tables that reference a scoped table (e.g. title_covers) are copied only for the scoped rows they reference.
  const sharedFilters = new Map();
  for (const fk of foreignKeys) {
    if (scoped.has(fk.child_table) || UNSHARED_TABLES.has(fk.child_table) || !scoped.has(fk.parent_table)) continue;
    if (sharedFilters.has(fk.child_table)) {
      throw new Error(`Unscoped table ${fk.child_table} has more than one foreign key to a library table; copy rules are unclear.`);
    }
    sharedFilters.set(fk.child_table, { column: fk.child_column, parentTable: fk.parent_table, parentColumn: fk.parent_column });
  }

  const tables = new Set([...scoped, ...sharedFilters.keys()]);
  const inSet = (table) => tables.has(table);

  // Union FK child columns with the single-column primary key they reference. Each resulting group shares one ID map.
  const parentOf = new Map();
  const find = (key) => {
    if (!parentOf.has(key)) parentOf.set(key, key);
    const parent = parentOf.get(key);
    if (parent === key) return key;
    const root = find(parent);
    parentOf.set(key, root);
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parentOf.set(rootA, rootB);
  };

  const primaryKeys = new Set(singleKeys
    .filter((key) => key.kind === 'p' && inSet(key.table_name))
    .map((key) => `${key.table_name}.${key.column_name}`));
  const uniqueKeys = singleKeys.filter((key) => key.kind === 'u' && inSet(key.table_name));
  for (const key of primaryKeys) find(key);

  // Every FK column pair must share a map, including columns of composite keys, so child rows keep matching parent rows.
  // Non-text pairs (e.g. dates in a composite key) are not identifiers and are copied unchanged.
  for (const fk of foreignKeys) {
    if (!inSet(fk.child_table) || !inSet(fk.parent_table)) continue;
    if (fk.child_column === 'library_service_id' || fk.parent_column === 'library_service_id') continue;
    const childType = columnsByTable.get(fk.child_table).get(fk.child_column);
    const parentType = columnsByTable.get(fk.parent_table).get(fk.parent_column);
    if (!TEXT_TYPES.has(childType) || !TEXT_TYPES.has(parentType)) continue;
    union(`${fk.child_table}.${fk.child_column}`, `${fk.parent_table}.${fk.parent_column}`);
  }

  const groups = new Map();
  for (const key of [...parentOf.keys()]) {
    const root = find(key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(key);
  }
  const domainMaps = new Map();
  for (const members of groups.values()) {
    const map = new Map();
    for (const member of members) {
      const [table, column] = member.split('.');
      if (!TEXT_TYPES.has(columnsByTable.get(table).get(column))) {
        throw new Error(`Cannot remap non-text identifier column ${member}.`);
      }
      domainMaps.set(member, map);
    }
  }

  for (const key of primaryKeys) {
    const [table, column] = key.split('.');
    if (!TEXT_TYPES.has(columnsByTable.get(table).get(column))) {
      throw new Error(`Cannot copy ${key}: non-text primary keys are not remapped.`);
    }
  }
  for (const key of uniqueKeys) {
    const member = `${key.table_name}.${key.column_name}`;
    if (!domainMaps.has(member)) {
      throw new Error(`Cannot copy: ${member} has a global unique constraint that is not scoped to the library service.`);
    }
  }

  return { scoped, tables, sharedFilters, columnsByTable, domainMaps, foreignKeys };
}

function orderTables(tables, foreignKeys) {
  const dependencies = new Map([...tables].map((table) => [table, new Set()]));
  for (const fk of foreignKeys) {
    if (fk.child_table === fk.parent_table) continue;
    if (tables.has(fk.child_table) && tables.has(fk.parent_table)) {
      dependencies.get(fk.child_table).add(fk.parent_table);
    }
  }
  const ordered = [];
  while (ordered.length < tables.size) {
    const ready = [...tables].filter((table) => !ordered.includes(table)
      && [...dependencies.get(table)].every((dependency) => ordered.includes(dependency)));
    if (!ready.length) throw new Error('Cannot order tables for copy because of a foreign-key cycle.');
    ordered.push(...ready);
  }
  return ordered;
}

function remapValue(map, value) {
  if (value === null || value === undefined) return value;
  if (!map.has(value)) map.set(value, randomUUID());
  return map.get(value);
}

async function copyTable(client, plan, table, newId, newName) {
  const filter = plan.sharedFilters.get(table);
  const where = plan.scoped.has(table)
    ? 'c.library_service_id = $1'
    : `c.${quoteIdent(filter.column)} IN (SELECT p.${quoteIdent(filter.parentColumn)} FROM ${quoteIdent(filter.parentTable)} AS p WHERE p.library_service_id = $1)`;
  const { rows } = await client.query(
    `SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) AS rows FROM ${quoteIdent(table)} AS c WHERE ${where}`,
    [SOURCE_ID],
  );
  const sourceRows = rows[0].rows;
  if (!sourceRows.length) return 0;

  const columns = plan.columnsByTable.get(table);
  const copies = sourceRows.map((row) => {
    const copy = { ...row };
    for (const column of columns.keys()) {
      const map = plan.domainMaps.get(`${table}.${column}`);
      if (map) copy[column] = remapValue(map, copy[column]);
    }
    if (plan.scoped.has(table)) copy.library_service_id = newId;
    if (table === 'lending_settings' && columns.has('name')) copy.name = newName;
    return copy;
  });

  const result = await client.query(
    `INSERT INTO ${quoteIdent(table)} SELECT * FROM jsonb_populate_recordset(NULL::${quoteIdent(table)}, $1::jsonb)`,
    [JSON.stringify(copies)],
  );
  if (result.rowCount !== sourceRows.length) {
    throw new Error(`Copied ${result.rowCount} of ${sourceRows.length} rows for ${table}.`);
  }
  return sourceRows.length;
}

async function copyService(client, newName) {
  await assertMigrationsApplied(client);
  const role = (await client.query('SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user')).rows[0];
  if (!role?.bypass) {
    throw new Error('Run the copy as the migration role: row-level security must be bypassed to read all library data.');
  }
  if (!(await client.query('SELECT 1 FROM library_services WHERE id = $1', [SOURCE_ID])).rowCount) {
    throw new Error(`Library service "${SOURCE_ID}" was not found.`);
  }
  if ((await client.query('SELECT 1 FROM library_services WHERE lower(name) = lower($1)', [newName])).rowCount) {
    throw new Error(`A library service named "${newName}" already exists.`);
  }

  const plan = planCopy(await readSchema(client));
  const newId = randomUUID();
  await client.query('INSERT INTO library_services (id, name) VALUES ($1, $2)', [newId, newName]);

  const counts = {};
  for (const table of orderTables(plan.tables, plan.foreignKeys)) {
    counts[table] = await copyTable(client, plan, table, newId, newName);
  }
  return { id: newId, name: newName, counts };
}

// Session-level lock matches withTransaction's per-service key, so writers to Hume wait for the copy.
// The snapshot is taken after the lock is held, so the copy sees a consistent, quiescent Hume.
async function copyHumeLibraryService(pool, name) {
  const newName = normaliseName(name);
  const client = await pool.connect();
  let healthy = false;
  try {
    await client.query('SELECT pg_advisory_lock(180313023, hashtext($1))', [SOURCE_ID]);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    let result;
    try {
      result = await copyService(client, newName);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    await client.query('SELECT pg_advisory_unlock(180313023, hashtext($1))', [SOURCE_ID]);
    healthy = true;
    return result;
  } finally {
    client.release(!healthy);
  }
}

module.exports = { copyHumeLibraryService };

if (require.main === module) {
  const { getPool } = require('./db');
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run copy-hume-library-service -- "Hume Development"');
    process.exit(1);
  }
  const pool = getPool();
  copyHumeLibraryService(pool, name)
    .then((result) => {
      const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      console.log(`Created library service "${result.name}" (${result.id}) with ${total} rows across ${Object.keys(result.counts).length} tables.`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
