import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { seed } from '../src/domain/seed';
import { makeScheduleExport, scheduleCsv } from '../src/domain/schedule-export';
import { makeSchedulePdf } from '../src/domain/schedule-pdf';

function fixture() {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.status = 'drafted';
  cycle.name = 'Draft cycle';
  cycle.slots = [
    { id: 's1', clubId: 'c1', month: '2027-01', meeting: '2027-01-15' },
    { id: 's2', clubId: 'c1', month: '2027-02', meeting: null },
    { id: 's3', clubId: 'c2', month: '2027-01', meeting: '2027-01-16' },
  ];
  data.assignments = [
    { id: 'a1', cycleId: cycle.id, slotId: 's1', clubId: 'c1', kitId: 'k1', ready: '2027-01-01', meeting: '2027-01-15', due: '2027-02-01', locked: true },
    { id: 'a2', cycleId: cycle.id, slotId: 's3', clubId: 'c2', kitId: 'k2', ready: '2027-01-02', meeting: '2027-01-16', due: '2027-02-02', locked: false },
  ];
  data.cycles.push({ ...cycle, id: 'published', name: 'Published cycle', status: 'published',
    slots: [{ id: 's4', clubId: 'c1', month: '2028-01', meeting: null }] });
  data.cycles.push({ ...cycle, id: 'hidden', name: 'Collecting cycle', status: 'collecting',
    slots: [{ id: 's5', clubId: 'c1', month: '2029-01', meeting: null }] });
  return data;
}

test('staff export uses selected clubs, local cycle slots and local assignments', () => {
  const data = fixture();
  const cycle = { ...data.cycles[0], slots: [...data.cycles[0].slots, { id: 'local', clubId: 'c1', month: '2027-03', meeting: null }] };
  data.assignments[0].meeting = '2027-01-20';
  const result = makeScheduleExport(data, ['c1'], cycle, true);
  assert.match(result.label, /Unsaved local schedule/);
  assert.deepEqual(result.meetings.map((row) => row.slotId), ['s1', 's2', 'local']);
  assert.equal(result.meetings[0].meeting, '2027-01-20');
  assert.equal(result.meetings[0].barcode, 'KIT-101');
  assert.equal(result.meetings[1].assignmentId, '');
  assert.equal(makeScheduleExport(data, [], cycle).meetings.length, 0);
});

test('member export includes selected clubs and visible cycles, including unassigned meetings', () => {
  const data = fixture();
  const result = makeScheduleExport(data, ['c1']);
  assert.deepEqual(result.meetings.map((row) => row.slotId), ['s1', 's2', 's4']);
  assert.deepEqual(result.meetings.map((row) => row.cycleStatus), ['drafted', 'drafted', 'published']);
});

test('CSV quotes fields, protects spreadsheet formulas and identifies unsaved scope', () => {
  const data = fixture();
  data.titles[0].name = '=SUM(1,2)\n"Book"';
  data.clubs[0].name = ' +Risk';
  const csv = scheduleCsv(makeScheduleExport(data, ['c1'], data.cycles[0], true));
  assert.ok(csv.startsWith('\uFEFF"Export scope"'));
  assert.match(csv, /"'\s\+Risk"/);
  assert.ok(csv.includes('"\'=SUM(1,2)\n""Book"""'));
  assert.ok(csv.includes('Unsaved local schedule'));
  assert.ok(csv.includes('"Unassigned"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('PDF embeds covers and paginates long schedules', async () => {
  const data = fixture();
  const schedule = makeScheduleExport(data, ['c1'], data.cycles[0]);
  schedule.meetings = Array.from({ length: 30 }, (_, index) => ({
    ...schedule.meetings[0], slotId: String(index), title: `Title ${index} ${'Long title '.repeat(8)}`,
  }));
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const { bytes, invalidCovers } = await makeSchedulePdf(schedule, font, new Map([['t1', image]]), '2027-01-01');
  assert.equal(invalidCovers, 0);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('/Subtype /Image')));
});

test('PDF embeds the original font without corrupting its glyph data', async () => {
  const data = fixture();
  data.titles[0].name = 'Café and The Lantern Garden';
  const schedule = makeScheduleExport(data, ['c1'], data.cycles[0]);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const { bytes } = await makeSchedulePdf(schedule, font, new Map(), '2027-01-01');
  const pdf = await PDFDocument.load(bytes);
  const descriptor = pdf.context.enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFDict => object instanceof PDFDict && object.has(PDFName.of('FontFile2')));
  assert.ok(descriptor, 'PDF must contain an embedded TrueType font');
  const embedded = descriptor.lookup(PDFName.of('FontFile2'));
  assert.ok(embedded instanceof PDFRawStream, 'Embedded font must be a stream');
  assert.deepEqual(Buffer.from(decodePDFRawStream(embedded).decode()), font);
});

test('PDF reports invalid covers and still exports with a placeholder', async () => {
  const schedule = makeScheduleExport(fixture(), ['c1']);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const { bytes, invalidCovers } = await makeSchedulePdf(schedule, font, new Map([['t1', new Uint8Array([0xff, 0xd8, 0])]]), '2027-01-01');
  assert.equal(invalidCovers, 1);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
});

test('PDF reports characters not supported by its bundled font', async () => {
  const schedule = makeScheduleExport(fixture(), ['c1']);
  schedule.meetings[0].title = '漢字';
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  await assert.rejects(makeSchedulePdf(schedule, font, new Map(), '2027-01-01'), /font cannot display/);
});
