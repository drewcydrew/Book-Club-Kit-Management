import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import { unzipSync } from 'fflate';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { seed } from '../src/domain/seed';
import { makeHandoutSnapshot } from '../src/domain/schedule-handouts';
import { handoutsZip, makeHandoutsPdf } from '../src/domain/schedule-handouts-pdf';

function fixture() {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.name = 'Reading year';
  cycle.status = 'drafted';
  cycle.slots = [
    { id: 'later', clubId: 'c1', month: '2027-03', meeting: null },
    { id: 'first', clubId: 'c1', month: '2027-01', meeting: '2027-01-15' },
    { id: 'hidden', clubId: 'c2', month: '2027-01', meeting: '2027-01-20' },
  ];
  data.assignments = [
    { id: 'a', cycleId: cycle.id, slotId: 'first', clubId: 'c1', kitId: 'k1', ready: '2027-01-01', meeting: '2027-01-15', due: '2027-02-01', locked: false },
    { id: 'b', cycleId: cycle.id, slotId: 'hidden', clubId: 'c2', kitId: 'k2', ready: '2027-01-01', meeting: '2027-01-20', due: '2027-02-01', locked: false },
  ];
  return { data, cycle };
}

test('handouts preserve shown clubs, local schedule, unassigned meetings and empty clubs', () => {
  const { data, cycle } = fixture();
  data.clubs.push({ ...data.clubs[0], id: 'empty', name: 'Empty club' });
  data.titles.find((title) => title.id === data.kits.find((kit) => kit.id === 'k1')!.titleId)!.synopsis = 'A description.';
  const result = makeHandoutSnapshot(data, cycle, ['c1', 'empty'], true);
  assert.deepEqual(result.clubs.map((club) => club.id), ['c1', 'empty']);
  assert.equal(result.unsaved, true);
  assert.deepEqual(result.clubs[0].meetings.map((item) => item.date), ['2027-01-15', '2027-03 · Date to be confirmed']);
  assert.equal(result.clubs[0].meetings[0].synopsis, 'A description.');
  assert.equal(result.clubs[0].meetings[1].title, 'Title to be confirmed');
  assert.equal(result.clubs[1].meetings.length, 0);
  data.assignments[0].kitId = 'missing';
  assert.throws(() => makeHandoutSnapshot(data, cycle, ['c1'], false), /assigned title.*unavailable/i);
});

test('combined and ZIP handouts contain one page per shown club and flag shortened descriptions', async () => {
  const { data, cycle } = fixture();
  data.clubs[0].name = '../Same/club';
  data.clubs[1].name = '../Same/club';
  data.titles.forEach((title) => { title.synopsis = 'A very long description '.repeat(100); });
  const snapshot = makeHandoutSnapshot(data, cycle, ['c1', 'c2'], true);
  const bytes = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const result = await makeHandoutsPdf(snapshot, bytes, new Map(), '2027-01-01');
  assert.equal(result.shortened.length, 2);
  const combined = await PDFDocument.load(result.bytes);
  assert.equal(combined.getPageCount(), 2);
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const font = await fontDoc.embedFont(bytes);
  const pageContent = (index: number) => {
    const streams = combined.getPage(index).node.Contents();
    assert.ok(streams instanceof PDFArray);
    return Array.from({ length: streams.size() }, (_, i) =>
      Buffer.from(decodePDFRawStream(streams.lookup(i, PDFRawStream)).decode()).toString('ascii')).join('\n');
  };
  assert.ok(pageContent(0).includes(`${font.encodeText('UNSAVED LOCAL SCHEDULE')} Tj`) || pageContent(0).includes(`${font.encodeText('drafted · UNSAVED LOCAL SCHEDULE')} Tj`));
  assert.ok(pageContent(0).includes(`${font.encodeText('15-01-2027')} Tj`));
  assert.ok(pageContent(0).includes(`${font.encodeText('03-2027 · Date to be confirmed')} Tj`));
  assert.ok(pageContent(0).includes(`${font.encodeText('Exported 01-01-2027')} Tj`));
  assert.ok(pageContent(0).includes(`${font.encodeText('Title to be confirmed')} Tj`));
  assert.ok(!pageContent(1).includes(`${font.encodeText('Title to be confirmed')} Tj`));
  const archive = unzipSync(await handoutsZip(result.bytes, snapshot.clubs));
  assert.deepEqual(Object.keys(archive), ['001-Same-club.pdf', '002-Same-club.pdf']);
  for (const [index, bytes] of Object.values(archive).entries()) {
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    const streams = pdf.getPage(0).node.Contents();
    assert.ok(streams instanceof PDFArray);
    const content = Array.from({ length: streams.size() }, (_, i) =>
      Buffer.from(decodePDFRawStream(streams.lookup(i, PDFRawStream)).decode()).toString('ascii')).join('\n');
    assert.ok(content.includes(`${font.encodeText(snapshot.clubs[index].meetings[0].title)} Tj`));
    if (index === 1) assert.ok(!content.includes(`${font.encodeText('Title to be confirmed')} Tj`));
  }
});

test('too many meetings fail rather than omit allocations', async () => {
  const { data, cycle } = fixture();
  cycle.slots = Array.from({ length: 30 }, (_, index) => ({ id: `slot-${index}`, clubId: 'c1', month: '2027-01', meeting: null }));
  data.assignments = [];
  const snapshot = makeHandoutSnapshot(data, cycle, ['c1'], false);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  await assert.rejects(makeHandoutsPdf(snapshot, font, new Map(), '2027-01-01'), /cannot fit legibly on one page/i);
});

test('a twelve-meeting annual handout fits on one A4 page and reports invalid covers', async () => {
  const { data, cycle } = fixture();
  cycle.slots = Array.from({ length: 12 }, (_, index) => ({
    id: `slot-${index}`, clubId: 'c1', month: `2027-${String(index + 1).padStart(2, '0')}`,
    meeting: `2027-${String(index + 1).padStart(2, '0')}-15`,
  }));
  data.assignments = cycle.slots.map((slot, index) => ({
    id: `assignment-${index}`, cycleId: cycle.id, slotId: slot.id, clubId: 'c1', kitId: 'k1',
    ready: slot.meeting!, meeting: slot.meeting!, due: slot.meeting!, locked: false,
  }));
  data.titles.find((title) => title.id === data.kits.find((kit) => kit.id === 'k1')!.titleId)!.synopsis = 'A compelling book about the world.';
  const snapshot = makeHandoutSnapshot(data, cycle, ['c1'], false);
  const font = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
  const result = await makeHandoutsPdf(snapshot, font, new Map([[snapshot.clubs[0].meetings[0].titleId, new Uint8Array([0x89, 0x50])]]), '2027-01-01');
  assert.equal(result.invalidCovers, 1);
  const pdf = await PDFDocument.load(result.bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595.28) < 0.1);
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const embedded = await fontDoc.embedFont(font);
  const streams = pdf.getPage(0).node.Contents();
  assert.ok(streams instanceof PDFArray);
  const content = Array.from({ length: streams.size() }, (_, i) =>
    Buffer.from(decodePDFRawStream(streams.lookup(i, PDFRawStream)).decode()).toString('ascii')).join('\n');
  for (const slot of cycle.slots) {
    const [year, month, day] = slot.meeting!.split('-');
    assert.ok(content.includes(`${embedded.encodeText(`${day}-${month}-${year}`)} Tj`));
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXcAAAAASUVORK5CYII=', 'base64');
  const withCover = await makeHandoutsPdf(snapshot, font, new Map([[snapshot.clubs[0].meetings[0].titleId, png]]), '2027-01-01');
  assert.equal(withCover.invalidCovers, 0);
  const imagePage = (await PDFDocument.load(withCover.bytes)).getPage(0);
  assert.ok(imagePage.node.Resources()?.get(PDFName.of('XObject')));
});
