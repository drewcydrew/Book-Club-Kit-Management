import assert from 'node:assert/strict';
import test from 'node:test';
import type { Club } from '../src/domain/model';
import { clubDefinitionHeaders, clubDefinitionsCsv, skippedMonthNames } from '../src/domain/club-export';

const club = { id: 'a', name: "Jackson's Creek Probus", branch: 'Hume', cadence: 2 as const, meetingWeekday: 4 as const, meetingOccurrence: 2 as const, skipMonths: (1 << 0) | (1 << 11), pickupOffsetDays: -7 } as Club;
const lines = (csv: string) => csv.replace('\uFEFF', '').trimEnd().split('\r\n');

test('exports a header row and one row per club with labels and signed offset', () => {
  const rows = lines(clubDefinitionsCsv([club]));
  assert.equal(rows[0], clubDefinitionHeaders.map((header) => `"${header}"`).join(','));
  assert.equal(rows[1], '"Jackson\'s Creek Probus","2nd","Thursday","Every 6 weeks","-7","Jan; Dec"');
});

test('quotes club names containing commas and neutralises formula-like names', () => {
  const rows = lines(clubDefinitionsCsv([{ ...club, name: '=Book, Club', skipMonths: 0, pickupOffsetDays: 0 }]));
  assert.equal(rows[1], `"'=Book, Club","2nd","Thursday","Every 6 weeks","0",""`);
});

test('writes a UTF-8 BOM and CRLF line endings', () => {
  const csv = clubDefinitionsCsv([club]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('skipped month names follow calendar order and reject invalid masks', () => {
  assert.equal(skippedMonthNames(0), '');
  assert.equal(skippedMonthNames((1 << 1) | (1 << 5)), 'Feb; Jun');
  assert.throws(() => skippedMonthNames(-1));
});
