import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { makeClubPdf } from '../src/domain/club-overview-pdf';
import { makeHandoutClubs } from '../src/domain/schedule-handouts';
import { handoutsZip } from '../src/domain/schedule-handouts-pdf';
import { seed } from '../src/domain/seed';

function fixture() {
  const data = seed();
  data.kits.find((kit) => kit.id === 'k2')!.titleId = 't2';
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

test('handout clubs show each selected club with its own months, including unassigned meetings', () => {
  const { data, cycle } = fixture();
  data.clubs.push({ ...data.clubs[0], id: 'empty', name: 'Empty club' });
  const { clubs } = makeHandoutClubs(data, cycle, ['c1', 'empty'], '2027-01-01');
  assert.deepEqual(clubs.map((club) => club.club), [data.clubs[0].name, 'Empty club']);
  const january = clubs[0].months.find((entry) => entry.month === '2027-01');
  const titleName = data.titles.find((title) => title.id === data.kits.find((kit) => kit.id === 'k1')!.titleId)!.name;
  assert.equal(january?.book?.name, titleName);
  assert.equal(clubs[0].months.find((entry) => entry.month === '2027-03')?.book, undefined);
  assert.ok(!clubs[0].months.some((entry) => entry.book?.name === data.titles.find((title) => title.id === data.kits.find((kit) => kit.id === 'k2')!.titleId)!.name));
});

test('handout clubs include a collecting cycle that the member view would hide', () => {
  const { data, cycle } = fixture();
  cycle.status = 'collecting';
  const { clubs } = makeHandoutClubs(data, cycle, ['c1'], '2027-01-01');
  assert.ok(clubs[0].months.some((entry) => entry.book !== undefined));
});

test('handout badges show the club priority for each assigned title, or a dash when unranked', () => {
  const { data, cycle } = fixture();
  const titleOfKit = (kitId: string) => data.titles.find((title) => title.id === data.kits.find((kit) => kit.id === kitId)!.titleId)!.id;
  cycle.finalized = { c1: [titleOfKit('k2'), titleOfKit('k1')], c2: [] };
  const { clubs } = makeHandoutClubs(data, cycle, ['c1', 'c2'], '2027-01-01');
  assert.equal(clubs[0].months.find((entry) => entry.month === '2027-01')?.book?.priority, 2);
  assert.equal(clubs[1].months.find((entry) => entry.month === '2027-01')?.book?.priority, null);
});

for (const format of ['overview', 'compact'] as const) {
  test(`combined and ZIP ${format} handouts contain exactly one page per shown club`, async () => {
    const { data, cycle } = fixture();
    data.clubs[0].name = '../Same/club';
    data.clubs[1].name = '../Same/club';
    const { clubs } = makeHandoutClubs(data, cycle, ['c1', 'c2'], '2027-01-01');
    const fontBytes = await readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
    const boldFontBytes = await readFile('node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf');
    const result = await makeClubPdf(format, { clubs, fontBytes, boldFontBytes, covers: new Map(), exportedAt: '2027-01-01' });
    assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 2);

    const archive = unzipSync(await handoutsZip(result.bytes, clubs.map((club) => club.club)));
    assert.deepEqual(Object.keys(archive), ['001-Same-club.pdf', '002-Same-club.pdf']);
    for (const bytes of Object.values(archive)) {
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    }
  });
}
