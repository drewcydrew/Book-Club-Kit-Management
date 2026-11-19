function normalize(definition, schema) {
  if (definition === null) return null;
  const quoted = `"${schema.replace(/"/g, '""')}".`;
  return definition.split(quoted).join('').split(`${schema}.`).join('');
}

async function inventory(client, schema) {
  const columns = await client.query(`
    SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null,
      pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname,a.attname`, [schema]);
  const constraints = await client.query(`
    SELECT c.relname AS table_name, x.conname AS name, pg_get_constraintdef(x.oid) AS definition
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname,x.conname`, [schema]);
  const indexes = await client.query(`
    SELECT c.relname AS table_name, i.relname AS name, pg_get_indexdef(i.oid) AS definition,
      x.indisvalid AS valid, x.indisready AS ready
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname,i.relname`, [schema]);
  const triggers = await client.query(`
    SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition,
      t.tgenabled AS enabled, pg_get_functiondef(t.tgfoid) AS function_definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`, [schema]);
  const tables = await client.query(`
    SELECT c.relname AS name, c.relrowsecurity AS row_security, c.relforcerowsecurity AS force_row_security
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname`, [schema]);
  const result = {};
  for (const { name, ...properties } of tables.rows) {
    result[name] = { properties, columns: {}, constraints: {}, indexes: {}, triggers: {} };
  }
  for (const [kind, rows] of Object.entries({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, triggers: triggers.rows })) {
    for (const { table_name: table, name, ...properties } of rows) {
      for (const key of ['definition', 'default_value', 'function_definition']) {
        if (typeof properties[key] === 'string') properties[key] = normalize(properties[key], schema);
      }
      result[table][kind][name] = properties;
    }
  }
  return result;
}

function compareInventory(expected, actual, excluded = []) {
  const issues = [];
  for (const [table, groups] of Object.entries(expected)) {
    if (excluded.includes(table)) continue;
    if (!actual[table]) { issues.push(`Missing table ${table}.`); continue; }
    if (JSON.stringify(groups.properties) !== JSON.stringify(actual[table].properties)) issues.push(`Incompatible row security on ${table}.`);
    for (const [kind, objects] of Object.entries(groups)) {
      if (kind === 'properties') continue;
      for (const [name, properties] of Object.entries(objects)) {
        const found = actual[table][kind][name];
        if (!found) issues.push(`Missing ${kind.slice(0, -1)} ${table}.${name}.`);
        else if (JSON.stringify(found) !== JSON.stringify(properties)) issues.push(`Incompatible ${kind.slice(0, -1)} ${table}.${name}.`);
      }
    }
  }
  return issues;
}

module.exports = { inventory, compareInventory };
