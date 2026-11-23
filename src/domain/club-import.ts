import { cadenceLabel } from './cadence';
import { clubDefinitionHeaders, monthNames, skippedMonthNames } from './club-export';
import { isPickupOffset, meetingOccurrences, meetingWeekdays } from './meeting-rule';
import type { Club } from './model';

export type ClubDefinition = Pick<Club, 'cadence' | 'meetingWeekday' | 'meetingOccurrence' | 'pickupOffsetDays' | 'skipMonths'>;
export type ClubDefinitionRow = { line: number; name: string; definition: ClubDefinition };
export type ClubDefinitionChange = { field: string; from: string; to: string };
export type ClubDefinitionUpdate = { club: Club; definition: ClubDefinition; changes: ClubDefinitionChange[] };
export type ClubImportPlan = {
  updates: ClubDefinitionUpdate[];
  unchanged: number;
  unmatched: { line: number; name: string }[];
  errors: string[];
};

const [, occurrenceField, weekdayField, repeatsField, pickupField, skippedField] = clubDefinitionHeaders;
const cadences: Club['cadence'][] = [1, 2];

// Minimal RFC 4180 parser: handles quoted fields, doubled quotes, and CRLF/LF. Blank records are kept so line numbers stay aligned.
function parseCsvRecords(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (source[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('The file has an unterminated quoted field.');
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

// Reverses the formula guard added by csvCell, which prefixes names that look like formulas with a quote.
function unguardName(value: string): string {
  return /^'\s*[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

function findLabel<T extends number>(items: { value: T; label: string }[], text: string): T | undefined {
  const wanted = text.trim().toLowerCase();
  return items.find((item) => item.label.toLowerCase() === wanted)?.value;
}

function parseDefinitionCells(cells: string[]): { name: string; definition: ClubDefinition } {
  const [rawName = '', occurrence = '', weekday = '', repeats = '', pickup = '', skipped = ''] = cells;
  const name = unguardName(rawName).trim();
  if (!name) throw new Error('Club name is missing.');

  const meetingOccurrence = findLabel(meetingOccurrences, occurrence);
  if (meetingOccurrence === undefined) {
    throw new Error(`${occurrenceField} "${occurrence.trim()}" must be one of ${meetingOccurrences.map((item) => item.label).join(', ')}.`);
  }
  const meetingWeekday = findLabel(meetingWeekdays, weekday);
  if (meetingWeekday === undefined) {
    throw new Error(`${weekdayField} "${weekday.trim()}" must be a weekday name.`);
  }
  const cadence = cadences.find((item) => cadenceLabel(item).toLowerCase() === repeats.trim().toLowerCase());
  if (cadence === undefined) {
    throw new Error(`${repeatsField} "${repeats.trim()}" must be ${cadences.map(cadenceLabel).join(' or ')}.`);
  }

  const pickupText = pickup.trim();
  const pickupOffsetDays = /^-?\d+$/.test(pickupText) ? Number(pickupText) : NaN;
  if (!isPickupOffset(pickupOffsetDays)) {
    throw new Error(`${pickupField} "${pickupText}" must be a whole number of days from -7 to 7.`);
  }

  let skipMonths = 0;
  for (const part of skipped.split(/[;,]/).map((item) => item.trim()).filter(Boolean)) {
    const index = monthNames.findIndex((month) => month.toLowerCase() === part.toLowerCase());
    if (index < 0) throw new Error(`${skippedField} "${part}" is not a month abbreviation such as Jan.`);
    skipMonths |= 1 << index;
  }

  return { name, definition: { cadence, meetingWeekday, meetingOccurrence, pickupOffsetDays, skipMonths } };
}

export function parseClubDefinitionsCsv(text: string): { rows: ClubDefinitionRow[]; errors: string[] } {
  const records = parseCsvRecords(text);
  const header = (records[0] ?? []).map((cell) => cell.trim());
  if (header.length !== clubDefinitionHeaders.length || header.some((cell, index) => cell !== clubDefinitionHeaders[index])) {
    return { rows: [], errors: ['The file header does not match the club definitions export.'] };
  }

  const rows: ClubDefinitionRow[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  records.forEach((cells, index) => {
    const line = index + 1;
    if (index === 0 || cells.every((cell) => cell.trim() === '')) return;
    try {
      const { name, definition } = parseDefinitionCells(cells);
      const firstLine = seen.get(name);
      if (firstLine !== undefined) throw new Error(`Club "${name}" is also listed on line ${firstLine}.`);
      seen.set(name, line);
      rows.push({ line, name, definition });
    } catch (error) {
      errors.push(`Line ${line}: ${error instanceof Error ? error.message : 'invalid row.'}`);
    }
  });
  return { rows, errors };
}

function describeDefinition(definition: ClubDefinition): Record<string, string> {
  return {
    [occurrenceField]: meetingOccurrences.find((item) => item.value === definition.meetingOccurrence)?.label ?? '',
    [weekdayField]: meetingWeekdays.find((item) => item.value === definition.meetingWeekday)?.label ?? '',
    [repeatsField]: cadenceLabel(definition.cadence),
    [pickupField]: String(definition.pickupOffsetDays),
    [skippedField]: skippedMonthNames(definition.skipMonths),
  };
}

// Matches each row to a club by trimmed, case-sensitive name and lists only the clubs whose rule actually changes.
export function planClubDefinitionImport(rows: ClubDefinitionRow[], clubs: Club[]): ClubImportPlan {
  const plan: ClubImportPlan = { updates: [], unchanged: 0, unmatched: [], errors: [] };
  for (const row of rows) {
    const matches = clubs.filter((club) => club.name.trim() === row.name);
    if (matches.length === 0) {
      plan.unmatched.push({ line: row.line, name: row.name });
      continue;
    }
    if (matches.length > 1) {
      plan.errors.push(`Line ${row.line}: more than one club is named "${row.name}".`);
      continue;
    }
    const club = matches[0];
    const before = describeDefinition(club);
    const after = describeDefinition(row.definition);
    const changes = Object.keys(after)
      .filter((field) => before[field] !== after[field])
      .map((field) => ({ field, from: before[field], to: after[field] }));
    if (changes.length) plan.updates.push({ club, definition: row.definition, changes });
    else plan.unchanged += 1;
  }
  return plan;
}
