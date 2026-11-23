import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { makeScheduleExport } from '../src/domain/schedule-export';
import { makeSchedulePdf } from '../src/domain/schedule-pdf';
import { seed } from '../src/domain/seed';

const fontBytes = () => readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');

function kitFixture() {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.status = 'drafted';
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-04-30';
  cycle.slots = [
    { id: 's1', clubId: 'c1', month: '2027-01', meeting: '2027-01-15' },
    { id: 's2', clubId: 'c1', month: '2027-02', meeting: null },
    { id: 's3', clubId: 'c2', month: '2027-01', meeting: '2027-01-16' },
  ];
  data.assignments = [
    { id: 'a1', cycleId: cycle.id, slotId: 's1', clubId: 'c1', kitId: 'k1', ready: '2027-01-01', meeting: '2027-01-15', due: '2027-02-01', locked: true },
    { id: 'a2', cycleId: cycle.id, slotId: 's3', clubId: 'c2', kitId: 'k2', ready: '2027-01-02', meeting: '2027-01-16', due: '2027-02-02', locked: false },
  ];
  return { data, cycle };
}

test('kit PDF has one page per kit followed by unassigned meeting pages', async () => {
  const { data, cycle } = kitFixture();
  const schedule = makeScheduleExport(data, ['c1', 'c2'], cycle, false, 'kits');
  assert.equal(schedule.kitPages?.kits.length, 2);
  const { bytes } = await makeSchedulePdf(schedule, await fontBytes(), new Map(), '2027-01-01');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 3);
});

test('kit PDF rejects a schedule with no assigned kits', async () => {
  const { data, cycle } = kitFixture();
  data.assignments = [];
  const schedule = makeScheduleExport(data, ['c1'], cycle, false, 'kits');
  await assert.rejects(makeSchedulePdf(schedule, await fontBytes(), new Map(), '2027-01-01'), /No assigned kits/);
});
