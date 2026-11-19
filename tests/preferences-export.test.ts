import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { priorityMatrix } from '../src/domain/cycle-overview';
import { makePreferencesExport, preferencesCsv, visiblePreferencesMatrix } from '../src/domain/preferences-export';
import { makePreferencesPdf } from '../src/domain/preferences-pdf';
import { seed } from '../src/domain/seed';

function fixture() {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.finalized = { c1: ['t2', 't1'] };
  data.assignments = [{ id: 'a', cycleId: cycle.id, clubId: 'c2', slotId: cycle.slots[1].id, kitId: 'k5',
    meeting: '2027-01-15', ready: '2027-01-01', due: '2027-01-30', locked: false }];
  return { data, cycle };
}

test('preference export is a title-by-club rank grid in visible order', () => {
  const { data, cycle } = fixture();
  const matrix = priorityMatrix(data, cycle, ['c1', 'c2'], data.assignments);
  const visible = visiblePreferencesMatrix(matrix, ['t3'], { id: 'c1', direction: 'ascending' }, { id: 't2', direction: 'descending' });
  const snapshot = makePreferencesExport(data, cycle, visible);
  assert.deepEqual(snapshot.clubs.map((club) => club.id), ['c2', 'c1']);
  assert.deepEqual(snapshot.titles.map((title) => title.id), ['t2', 't1', 't4']);
  assert.deepEqual(snapshot.titles.map((title) => title.cells.map((cell) => cell.rank)), [[2, 1], [1, 2], [null, null]]);
  const csv = preferencesCsv(snapshot);
  assert.equal(csv, '\uFEFF"Book title","Westside Stories","Harbour Readers"\r\n'
    + '"A Map of Small Things by Ari Vale","2","1"\r\n'
    + '"The Lantern Garden by Mara Fields","1","2"\r\n'
    + '"The Clockmaker’s Table by Jo Ellis","",""\r\n');
  assert.ok(!csv.includes(data.people[2].name));
  assert.ok(!csv.includes(data.titles[2].name));
  assert.deepEqual(makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments)).clubs.map((club) => club.id), ['c1']);
  assert.equal(visiblePreferencesMatrix(matrix, matrix.rows.map((row) => row.titleId), null, null).rows.length, 0);
  const nativeOrder = visiblePreferencesMatrix(matrix, ['t3'], { id: 'c2', direction: 'descending' }, null);
  assert.deepEqual(makePreferencesExport(data, cycle, nativeOrder).clubs.map((club) => club.id), ['c1', 'c2']);
  const previous = preferencesCsv(snapshot);
  data.titles.find((title) => title.id === 't1')!.name = 'Changed after snapshot';
  assert.equal(preferencesCsv(snapshot), previous);
});

test('preference CSV protects spreadsheet input and quotes data', () => {
  const { data, cycle } = fixture();
  data.titles[0].name = '=FORMULA,"quoted"';
  data.clubs[0].name = '+Club';
  const csv = preferencesCsv(makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments)));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=FORMULA,""quoted"" by Mara Fields"'));
  assert.ok(csv.includes('"Book title","\'+Club"'));
  const invalid = makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments));
  invalid.titles[0].cells[0].clubId = 'wrong';
  assert.throws(() => preferencesCsv(invalid), /columns are inconsistent/);
});

test('small preference PDF uses landscape A3 with covers and rank cells', async () => {
  const { data, cycle } = fixture();
  data.clubs[0].name = 'Alpha';
  data.clubs[1].name = 'Beta';
  data.titles[0].name = 'First';
  data.titles[1].name = 'Second';
  data.titles[3].name = 'Fourth';
  data.titles.forEach((title) => { title.author = ''; });
  const matrix = priorityMatrix(data, cycle, ['c1', 'c2'], data.assignments);
  const snapshot = makePreferencesExport(data, cycle, visiblePreferencesMatrix(matrix, ['t3'], { id: 'c1', direction: 'ascending' }, { id: 't2', direction: 'descending' }));
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const result = await makePreferencesPdf(snapshot, font, new Map([[snapshot.titles[0].id, image], [snapshot.titles[1].id, new Uint8Array([0x89, 0x50])]]), '2027-01-01');
  assert.equal(result.invalidCovers, 1);
  const pdf = await PDFDocument.load(result.bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 1190.55, height: 841.89 });
  assert.ok(Buffer.from(result.bytes).includes(Buffer.from('/Subtype /Image')));
  const streams = pdf.getPage(0).node.Contents();
  assert.ok(streams instanceof PDFArray);
  const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const embeddedFont = await fontDoc.embedFont(font);
  const position = (value: string) => content.indexOf(`${embeddedFont.encodeText(value)} Tj`);
  assert.ok(position('Beta') >= 0 && position('Beta') < position('Alpha'));
  assert.ok(position('Second') >= 0 && position('Second') < position('First') && position('First') < position('Fourth'));
  const rankText = [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\n(<[0-9A-F]+>) Tj/g)]
    .filter((match) => match[3] === String(embeddedFont.encodeText('1')) || match[3] === String(embeddedFont.encodeText('2')))
    .map((match) => [Number(match[1]), Number(match[2]), match[3] === String(embeddedFont.encodeText('1')) ? 1 : 2]);
  assert.deepEqual(rankText, [[284, 682, 2], [369, 682, 1], [284, 610, 1], [369, 610, 2]]);
  assert.equal(position('Unranked'), -1);
  assert.equal(position('Assigned'), -1);
  const rows = [...content.matchAll(/0\.78 0\.84 0\.81 RG\n[\d.]+ w\n\[\] 0 d\n1 0 0 1 ([\d.]+) ([\d.]+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 ([\d.]+) l\n([\d.]+) [\d.]+ l/g)];
  assert.equal(rows.length, snapshot.titles.length);
  rows.forEach((row) => {
    const [x, y, height, width] = row.slice(1).map(Number);
    assert.ok(x >= 0 && y >= 0 && x + width <= 1190.55 && y + height <= 841.89);
  });
});

test('large preference PDF paginates both axes and retains every ranking at readable size', async () => {
  const { data, cycle } = fixture();
  const base = makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments));
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const clubs = Array.from({ length: 11 }, (_, index) => ({ id: `club${index}`, name: `Club${index}` }));
  const snapshot = { ...base, clubs, titles: Array.from({ length: 201 }, (_, row) => ({
    ...base.titles[0], id: `row${row}`, name: `Title${row}`, author: '',
    cells: clubs.map((club, column) => ({ clubId: club.id, rank: (row + column) % 7 === 0 ? null : row * clubs.length + column + 1 })),
  })) };
  const result = await makePreferencesPdf(snapshot, font, new Map(), '2027-01-01');
  const pdf = await PDFDocument.load(result.bytes);
  assert.equal(pdf.getPageCount(), 46);
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const embeddedFont = await fontDoc.embedFont(font);
  pdf.getPages().forEach((page, pageIndex) => {
    assert.deepEqual(page.getSize(), { width: 1190.55, height: 841.89 });
    const streams = page.node.Contents();
    assert.ok(streams instanceof PDFArray);
    const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
    const sizes = [...content.matchAll(/\/\S+ ([\d.]+) Tf/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 8));
    const rowStart = Math.floor(pageIndex / 2) * 9;
    const clubStart = (pageIndex % 2) * 10;
    const pageClubs = clubs.slice(clubStart, clubStart + 10);
    for (const club of pageClubs) assert.ok(content.includes(`${embeddedFont.encodeText(club.name)} Tj`));
    snapshot.titles.slice(rowStart, rowStart + 9).forEach((title, rowIndex) => {
      assert.ok(content.includes(`${embeddedFont.encodeText(title.name)} Tj`));
      pageClubs.forEach((_, column) => {
        const rank = title.cells[clubStart + column].rank;
        const marker = `1 0 0 1 ${284 + column * 85} ${682 - rowIndex * 72} Tm\n`;
        if (rank === null) assert.ok(!content.includes(marker));
        else assert.ok(content.includes(`${marker}${embeddedFont.encodeText(String(rank))} Tj`));
      });
    });
  });
  assert.equal(result.shortened, false);
});

test('pagination handles exact page boundaries and repeats title covers across club pages', async () => {
  const { data, cycle } = fixture();
  const base = makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments));
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const image = await readFile('assets/icon.png');
  const makeSnapshot = (clubCount: number, titleCount: number) => {
    const clubs = Array.from({ length: clubCount }, (_, index) => ({ id: `c${index}`, name: `Club${index}` }));
    return { ...base, clubs, titles: Array.from({ length: titleCount }, (_, index) => ({
      ...base.titles[0], id: `title${index}`, name: `Title${index}`, author: '',
      cells: clubs.map((club) => ({ clubId: club.id, rank: 1 })),
    })) };
  };
  const exact = await makePreferencesPdf(makeSnapshot(10, 9), font, new Map(), '2027-01-01');
  assert.equal((await PDFDocument.load(exact.bytes)).getPageCount(), 1);
  const overflow = await makePreferencesPdf(makeSnapshot(11, 10), font, new Map([['title0', image]]), '2027-01-01');
  const pdf = await PDFDocument.load(overflow.bytes);
  assert.equal(pdf.getPageCount(), 4);
  for (const page of pdf.getPages().slice(0, 2)) {
    const streams = page.node.Contents();
    assert.ok(streams instanceof PDFArray);
    const content = Buffer.from(decodePDFRawStream(streams.lookup(0, PDFRawStream)).decode()).toString('ascii');
    assert.match(content, /\/Image-\d+ Do/);
  }
});

test('preference PDF reports truncated labels and unsupported glyphs', async () => {
  const { data, cycle } = fixture();
  const base = makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments));
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const result = await makePreferencesPdf({ ...base, titles: [{ ...base.titles[0], name: 'A very long title '.repeat(30) }] }, font, new Map(), '2027-01-01');
  assert.equal(result.shortened, true);
  await assert.rejects(() => makePreferencesPdf({ ...base, cycleName: '🦄' }, font, new Map(), '2027-01-01'), /font cannot display/);
});
