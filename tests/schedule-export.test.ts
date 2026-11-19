import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { seed } from '../src/domain/seed';
import { makeScheduleExport, scheduleCsv } from '../src/domain/schedule-export';
import { makeSchedulePdf } from '../src/domain/schedule-pdf';
import { focusedScheduleClub, scheduleClubsMatchingTitle, scheduleGrid } from '../src/domain/cycle-overview';

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

test('native club focus and highlight follow displayed slots and preserve export scope', () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-12-31';
  cycle.slots.push({ id: 'duplicate', clubId: 'c1', month: '2027-01', meeting: null });
  data.assignments.push({ ...data.assignments[0], id: 'duplicate-assignment', slotId: 'duplicate' });
  data.assignments.push({ ...data.assignments[0], id: 'local-replacement', kitId: 'k3' });
  const shown = ['c1', 'c2'];
  const matching = scheduleClubsMatchingTitle(data, cycle, shown, data.assignments, 't1');
  assert.deepEqual(matching, ['c2']);
  assert.equal(focusedScheduleClub(matching, 'c1'), 'c2');
  assert.equal(focusedScheduleClub([], 'c1'), '');
  assert.equal(focusedScheduleClub(shown, 'c2'), 'c2');
  const row = scheduleGrid(data, cycle, ['c1'], data.assignments).rows[0];
  assert.equal(row.cells.length, 12);
  assert.equal(row.cells[0].assignment?.id, 'local-replacement');
  assert.equal(row.cells[1].slot?.id, 's2');
  assert.equal(row.cells[2].slot, undefined);
  const highlighted = makeScheduleExport(data, shown, cycle, true, 'grid', 't1');
  assert.deepEqual(highlighted.highlight?.rows.map((entry) => entry.clubId), matching);
  assert.deepEqual(highlighted.grid?.rows.map((entry) => entry.clubId), shown);
  assert.equal(scheduleCsv(highlighted), scheduleCsv(makeScheduleExport(data, shown, cycle, true, 'grid')));
  assert.deepEqual(scheduleClubsMatchingTitle(data, cycle, ['c1'], data.assignments, 't1'), []);
  assert.deepEqual(scheduleClubsMatchingTitle(data, cycle, shown, data.assignments, 'missing'), []);
});

test('focused schedule derivation produces one row for a many-club cycle', () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-12-31';
  cycle.slots = Array.from({ length: 30 }, (_, club) => Array.from({ length: 12 }, (_, month) => ({
    id: `${club}-${month}`, clubId: `club-${club}`, month: `2027-${String(month + 1).padStart(2, '0')}`, meeting: null,
  }))).flat();
  const grid = scheduleGrid(data, cycle, ['club-17'], []);
  assert.equal(grid.rows.length, 1);
  assert.equal(grid.rows[0].cells.length, 12);
  assert.equal(grid.rows[0].cells[0].slot?.clubId, 'club-17');
});

test('focused schedule retains conflicts with assignments outside the focused club and cycle', () => {
  const data = fixture();
  const cycle = data.cycles[0];
  const assignment = data.assignments[0];
  data.assignments = [assignment, { ...assignment, id: 'other-cycle', cycleId: 'published', slotId: 's4' }];
  const row = scheduleGrid(data, cycle, ['c1'], data.assignments).rows[0];
  assert.match(row.cells.find((cell) => cell.assignment?.id === assignment.id)?.problem ?? '', /Kit loan windows conflict/);
});

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

test('staff CSV and PDF contain only selected clubs, including their unassigned meetings', async () => {
  const data = fixture();
  const cycle = data.cycles[0];
  const fontBytes = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const font = await fontDoc.embedFont(fontBytes);

  for (const [selectedId, excludedId] of [['c1', 'c2'], ['c2', 'c1']]) {
    const selected = data.clubs.find((club) => club.id === selectedId)!;
    const excluded = data.clubs.find((club) => club.id === excludedId)!;
    const schedule = makeScheduleExport(data, [selectedId], cycle);
    const csv = scheduleCsv(schedule);
    assert.ok(csv.includes(`"${selected.name}"`));
    assert.ok(!csv.includes(`"${excluded.name}"`));
    assert.equal(csv.includes('"Unassigned"'), selectedId === 'c1');

    const { bytes } = await makeSchedulePdf(schedule, fontBytes, new Map(), '2027-01-01');
    const pdf = await PDFDocument.load(bytes);
    const content = pdf.getPages().flatMap((page) => {
      const streams = page.node.Contents();
      assert.ok(streams instanceof PDFArray);
      return Array.from({ length: streams.size() }, (_, index) =>
        Buffer.from(decodePDFRawStream(streams.lookup(index, PDFRawStream)).decode()).toString('ascii'));
    }).join('\n');
    assert.ok(content.includes(`${font.encodeText(selected.name)} Tj`));
    assert.ok(!content.includes(`${font.encodeText(excluded.name)} Tj`));
    assert.equal(content.includes(`${font.encodeText('Not assigned')} Tj`), selectedId === 'c1');
  }
});

test('member export includes selected clubs and visible cycles, including unassigned meetings', () => {
  const data = fixture();
  const result = makeScheduleExport(data, ['c1']);
  assert.deepEqual(result.meetings.map((row) => row.slotId), ['s1', 's2', 's4']);
  assert.deepEqual(result.meetings.map((row) => row.cycleStatus), ['drafted', 'drafted', 'published']);
});

test('staff export modes match their views and preserve the selected club scope', () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-04-30';
  data.titles[0].name = '=Formula';
  const grid = makeScheduleExport(data, ['c1'], cycle, true, 'grid');
  const gridCsv = scheduleCsv(grid);
  assert.deepEqual(grid.grid?.months, ['2027-01', '2027-02', '2027-03', '2027-04']);
  assert.deepEqual(grid.grid?.rows[0].cells.map((cell) => cell?.slotId ?? null), ['s1', 's2', null, null]);
  assert.match(gridCsv, /2027-01 Title/);
  assert.match(gridCsv, /2027-02 Status/);
  assert.ok(gridCsv.includes('"\'=Formula"'));
  assert.ok(gridCsv.includes('"Unassigned"'));
  assert.ok(gridCsv.includes('"No meeting"'));
  assert.ok(gridCsv.includes('Unsaved local schedule'));
  assert.ok(!gridCsv.includes('Westside Stories'));

  const meetings = makeScheduleExport(data, ['c1'], cycle, false, 'meetings');
  assert.ok(scheduleCsv(meetings).includes('"Unassigned"'));
  const kits = makeScheduleExport(data, ['c1'], cycle, false, 'kits');
  assert.deepEqual(kits.meetings.map((row) => row.kitId), ['k1']);
  const kitsCsv = scheduleCsv(kits);
  assert.ok(kitsCsv.includes('"KIT-101"'));
  assert.ok(!kitsCsv.includes('"Unassigned"'));
  assert.ok(!kitsCsv.includes('KIT-102'));
  cycle.slots.push({ id: 's4', clubId: 'c1', month: '2027-03', meeting: '2027-03-15' });
  data.assignments.push({ id: 'a3', cycleId: cycle.id, slotId: 's4', clubId: 'c1', kitId: 'k2',
    ready: '2027-03-01', meeting: '2027-03-15', due: '2027-04-01', locked: false });
  assert.deepEqual(makeScheduleExport(data, ['c1', 'c2'], cycle, false, 'kits').meetings.map((row) => row.assignmentId), ['a1', 'a2', 'a3']);
  data.assignments = [];
  assert.equal(makeScheduleExport(data, ['c1'], cycle, false, 'kits').meetings.length, 0);
});

test('staff PDFs use the selected view and include covers', async () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-04-30';
  const fontBytes = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const font = await fontDoc.embedFont(fontBytes);
  for (const mode of ['grid', 'meetings', 'kits'] as const) {
    const schedule = makeScheduleExport(data, ['c1'], cycle, false, mode);
    const { bytes } = await makeSchedulePdf(schedule, fontBytes, new Map([['t1', image]]), '2027-01-01');
    const pdf = await PDFDocument.load(bytes);
    const content = pdf.getPages().flatMap((page) => {
      const streams = page.node.Contents();
      assert.ok(streams instanceof PDFArray);
      return Array.from({ length: streams.size() }, (_, index) =>
        Buffer.from(decodePDFRawStream(streams.lookup(index, PDFRawStream)).decode()).toString('ascii'));
    }).join('\n');
    const contains = (text: string) => content.includes(font.encodeText(text).toString().slice(1, -1));
    assert.ok(contains('Harbour Readers'));
    assert.ok(!contains('Westside Stories'));
    assert.equal(contains('Not assigned'), mode !== 'kits');
    assert.ok(Buffer.from(bytes).includes(Buffer.from('/Subtype /Image')));
    if (mode === 'grid') {
      assert.ok(pdf.getPageCount() >= 2);
      assert.ok(contains('2027-04'));
      assert.ok(contains('No meeting'));
    }
    if (mode === 'kits') assert.ok(contains('KIT-101'));
  }
});

test('highlighted PDF scope matches grid rows and leaves CSV and other modes unchanged', async () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-12-31';
  data.clubs.push({ ...data.clubs[0], id: 'c3', name: 'Another Club 🦄' }, { ...data.clubs[0], id: 'c4', name: 'Hidden Club 🦄' });
  cycle.slots.push(
    { id: 's4', clubId: 'c1', month: '2027-02', meeting: '2027-02-15' },
    { id: 's5', clubId: 'c2', month: '2027-03', meeting: '2027-03-16' },
    { id: 's6', clubId: 'c3', month: '2027-02', meeting: '2027-02-16' },
    { id: 's7', clubId: 'c4', month: '2027-01', meeting: '2027-01-17' },
  );
  cycle.slots = cycle.slots.filter((slot) => slot.id !== 's2');
  for (const [id, slotId, clubId, kitId, meeting] of [
    ['a4', 's4', 'c1', 'k3', '2027-02-15'], ['a5', 's5', 'c2', 'k2', '2027-03-16'],
    ['a6', 's6', 'c3', 'k3', '2027-02-16'], ['a7', 's7', 'c4', 'k1', '2027-01-17'],
  ]) {
    data.assignments.push({ id, cycleId: cycle.id, slotId, clubId, kitId, ready: meeting, meeting, due: meeting, locked: false });
  }
  const selected = ['c1', 'c2', 'c3'];
  const schedule = makeScheduleExport(data, selected, cycle, true, 'grid', 't1');
  assert.deepEqual(schedule.highlight?.rows.map((row) => row.clubId), ['c1', 'c2']);
  assert.deepEqual(schedule.highlight?.stops, [{ row: 0, column: 0 }, { row: 1, column: 0 }, { row: 1, column: 2 }]);
  assert.equal(schedule.highlight?.rows[0].cells[1].meeting?.titleId, 't2');
  assert.equal(scheduleCsv(schedule), scheduleCsv(makeScheduleExport(data, selected, cycle, true, 'grid')));
  assert.ok(scheduleCsv(schedule).includes('Another Club'));
  assert.ok(!scheduleCsv(schedule).includes('Hidden Club'));
  assert.equal(makeScheduleExport(data, selected, cycle, false, 'kits', 't1').highlight, undefined);
  assert.equal(makeScheduleExport(data, selected, undefined, false, 'grid', 't1').highlight, undefined);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const result = await makeSchedulePdf(schedule, font, new Map([['t1', image], ['t2', image]]), '2027-01-01');
  const pdf = await PDFDocument.load(result.bytes);
  const page = pdf.getPage(0);
  const streams = page.node.Contents();
  assert.ok(streams instanceof PDFArray);
  const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
  const lines = [...content.matchAll(/0\.145 0\.388 0\.922 RG\n[^\n]+ w\n\[\] 0 d\n([\d.]+) ([\d.]+) m\n\1 \2 m\n([\d.]+) ([\d.]+) l\nS/g)];
  const scale = Math.min(1, 802 / (120 + 12 * 54), 483 / (18 + 2 * 110));
  const points = schedule.highlight!.stops.map(({ row, column }) => [
    20 + (120 + column * 54 + 25) * scale, 503 - (18 + row * 110 + 38) * scale,
  ]);
  assert.equal(lines.length, points.length - 1);
  lines.forEach((line, index) => {
    const coordinates = line.slice(1).map(Number);
    [...points[index], ...points[index + 1]].forEach((value, coordinate) =>
      assert.ok(Math.abs(coordinates[coordinate] - value) < 0.0001));
  });
  const states = page.node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict);
  assert.ok(states.values().some((ref) => {
    const state = pdf.context.lookup(ref, PDFDict);
    return state.lookupMaybe(PDFName.of('ca'), PDFNumber)?.asNumber() === 0.25;
  }));
  assert.ok(Buffer.from(result.bytes).includes(Buffer.from('/Subtype /Image')));
  const noMatches = makeScheduleExport(data, selected, cycle, false, 'grid', 't4');
  assert.equal(noMatches.highlight?.rows.length, 0);
  await assert.rejects(makeSchedulePdf(noMatches, font, new Map(), '2027-01-01'), /No shown clubs/);
});

test('highlighted PDF fits all months and matching clubs onto one landscape page', async () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-12-31';
  data.clubs = Array.from({ length: 40 }, (_, index) => ({ ...data.clubs[0], id: `c${index}`, name: `Club ${index} ${'Long name '.repeat(8)}` }));
  cycle.slots = data.clubs.map((club, index) => ({ id: `s${index}`, clubId: club.id, month: '2027-01', meeting: '2027-01-15' }));
  data.assignments = cycle.slots.map((slot, index) => ({ id: `a${index}`, cycleId: cycle.id, slotId: slot.id,
    clubId: slot.clubId, kitId: 'k1', ready: '2027-01-01', meeting: '2027-01-15', due: '2027-02-01', locked: false }));
  const schedule = makeScheduleExport(data, data.clubs.map((club) => club.id), cycle, true, 'grid', 't1');
  assert.equal(schedule.highlight?.rows.length, 40);
  assert.equal(schedule.highlight?.stops.length, 40);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const { bytes, smallText, invalidCovers } = await makeSchedulePdf(schedule, font, new Map([['t1', image]]), '2027-01-01');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 842, height: 595 });
  assert.equal(smallText, true);
  assert.equal(invalidCovers, 0);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('/Subtype /Image')));
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const embeddedFont = await fontDoc.embedFont(font);
  const streams = pdf.getPage(0).node.Contents();
  assert.ok(streams instanceof PDFArray);
  const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
  for (const month of schedule.highlight!.months) assert.ok(content.includes(`${embeddedFont.encodeText(month)} Tj`));
  for (const club of data.clubs) assert.ok(content.includes(embeddedFont.encodeText(club.name.split(' Long name')[0]).toString().slice(1, -1)));
  const textPositions = [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)];
  assert.ok(textPositions.every(([, x, y]) => Number(x) >= 0 && Number(x) <= 842 && Number(y) >= 0 && Number(y) <= 595));
  const lines = [...content.matchAll(/0\.145 0\.388 0\.922 RG\n[^\n]+ w\n\[\] 0 d\n([\d.]+) ([\d.]+) m\n\1 \2 m\n([\d.]+) ([\d.]+) l\nS/g)];
  assert.equal(lines.length, 39);
  assert.ok(lines.every((line) => line.slice(1).map(Number).every((coordinate, index) =>
    coordinate >= 0 && coordinate <= (index % 2 === 0 ? 842 : 595))));
});

test('one highlighted match draws a single-page PDF and reports invalid covers', async () => {
  const data = fixture();
  const cycle = data.cycles[0];
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-01-31';
  cycle.slots = cycle.slots.filter((slot) => slot.id === 's1');
  data.assignments = data.assignments.filter((assignment) => assignment.id === 'a1');
  const schedule = makeScheduleExport(data, ['c1'], cycle, false, 'grid', 't1');
  assert.deepEqual(schedule.highlight?.stops, [{ row: 0, column: 0 }]);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const pdf = await makeSchedulePdf(schedule, font, new Map([['t1', new Uint8Array([0xff, 0xd8, 0])]]), '2027-01-01');
  assert.equal(pdf.invalidCovers, 1);
  assert.equal(pdf.smallText, false);
  const document = await PDFDocument.load(pdf.bytes);
  assert.equal(document.getPageCount(), 1);
  const streams = document.getPage(0).node.Contents();
  assert.ok(streams instanceof PDFArray);
  const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
  assert.ok(!/0\.145 0\.388 0\.922 RG\n[^\n]+ w\n\[\] 0 d\n([\d.]+) ([\d.]+) m\n\1 \2 m\n([\d.]+) ([\d.]+) l\nS/.test(content));
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
