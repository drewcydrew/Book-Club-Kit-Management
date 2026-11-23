import assert from 'node:assert/strict';
import test from 'node:test';
import type { Club } from '../src/domain/model';
import { clubDefinitionsCsv } from '../src/domain/club-export';
import { parseClubDefinitionsCsv, planClubDefinitionImport } from '../src/domain/club-import';

const club = { id: 'a', name: "Jackson's Creek Probus", branch: 'Hume', cadence: 2 as const, meetingWeekday: 4 as const, meetingOccurrence: 2 as const, skipMonths: (1 << 0) | (1 << 11), pickupOffsetDays: -7, revision: 3 } as Club;
const header = 'Club,First meeting occurrence,First meeting weekday,Repeats,Pickup offset (days),Skipped months';

test('exported definitions parse back to an unchanged plan', () => {
  const { rows, errors } = parseClubDefinitionsCsv(clubDefinitionsCsv([club]));
  assert.deepEqual(errors, []);
  const plan = planClubDefinitionImport(rows, [club]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged, 1);
});

test('accepts semicolon or comma separated skipped months and reports the changed fields', () => {
  const csv = `\uFEFF${header}\r\n"Club A","1st","Monday","Monthly","3","Feb, Jun"\r\n"Club B","Last","Friday","Every 6 weeks","0","Jan;Dec"\r\n`;
  const { rows, errors } = parseClubDefinitionsCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].definition.skipMonths, (1 << 1) | (1 << 5));
  assert.equal(rows[1].definition.meetingOccurrence, -1);
  const plan = planClubDefinitionImport(rows, [{ ...club, name: 'Club A', cadence: 2 as const, meetingWeekday: 1 as const, meetingOccurrence: 1 as const, pickupOffsetDays: 3, skipMonths: 0 } as Club]);
  assert.deepEqual(plan.updates[0].changes.map((change) => change.field), ['Repeats', 'Skipped months']);
});

test('reports invalid rows with their line numbers', () => {
  const csv = `${header}\r\n"Club A","5th","Monday","Monthly","0",""\r\n"Club B","1st","Monday","Weekly","0",""\r\n"Club C","1st","Monday","Monthly","9",""\r\n`;
  const { rows, errors } = parseClubDefinitionsCsv(csv);
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /^Line 2:/);
  assert.match(errors[1], /^Line 3:/);
  assert.match(errors[2], /^Line 4:/);
});

test('rejects duplicate names in the file and lists unmatched clubs without failing', () => {
  const csv = `${header}\r\n"Club A","1st","Monday","Monthly","0",""\r\n"Club A","2nd","Monday","Monthly","0",""\r\n`;
  const parsed = parseClubDefinitionsCsv(csv);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /also listed on line 2/);

  const unmatched = parseClubDefinitionsCsv(`${header}\r\n"Unknown Club","1st","Monday","Monthly","0",""\r\n`);
  const plan = planClubDefinitionImport(unmatched.rows, [club]);
  assert.deepEqual(plan.unmatched, [{ line: 2, name: 'Unknown Club' }]);
  assert.equal(plan.updates.length, 0);
});

test('rejects a file whose header does not match the export', () => {
  const { rows, errors } = parseClubDefinitionsCsv('Name,Day\r\nClub A,Monday\r\n');
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
});
