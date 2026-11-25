import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { makeClubOverviewPdf, makeCompactClubPdf, pdfDateLabel, readingPeriodLabel, titleLinks, type ClubOverviewPdfClub, type OverviewPdfMonth } from '../src/domain/club-overview-pdf';
import { calendarWeeks } from '../src/domain/member-calendar';

const fontBytes = () => readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
const boldFontBytes = () => readFile('node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf');

function month(value: string, book?: string): OverviewPdfMonth {
  return {
    month: value,
    weeks: calendarWeeks(value),
    markers: new Map([[`${value}-15`, ['ready', 'meeting']], [`${value}-22`, ['due']]]),
    book: book ? { name: book, author: 'Author' } : undefined,
  };
}

const club = (months: OverviewPdfMonth[]): ClubOverviewPdfClub => ({ club: 'Thursday Readers', details: 'Central · Monday · Monthly', months });

async function pages(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

test('overview PDF fits a normal club on one page', async () => {
  const months = [month('2027-01', 'The Miller Women'), month('2027-02'), month('2027-03', 'Dune'), month('2027-04', 'Emma')];
  const result = await makeClubOverviewPdf({ clubs: [club(months)], fontBytes: await fontBytes(), covers: new Map(), exportedAt: '2027-01-01' });
  assert.equal(await pages(result.bytes), 1);
  assert.equal(result.invalidCovers, 0);
});

test('overview PDF is one page for a club with no meetings', async () => {
  const result = await makeClubOverviewPdf({ clubs: [club([])], fontBytes: await fontBytes(), covers: new Map(), exportedAt: '2027-01-01' });
  assert.equal(await pages(result.bytes), 1);
});

test('overview PDF rejects overviews too long for one page', async () => {
  const months = Array.from({ length: 24 }, (_, index) => month(`2027-${String(index % 12 + 1).padStart(2, '0')}`, `Book ${index}`));
  await assert.rejects(
    makeClubOverviewPdf({ clubs: [club(months)], fontBytes: await fontBytes(), covers: new Map(), exportedAt: '2027-01-01' }),
    /one A4 page/,
  );
});

test('compact PDF fits a full year of meetings on one page', async () => {
  const months = Array.from({ length: 12 }, (_, index) => month(`2027-${String(index + 1).padStart(2, '0')}`, `Book ${index % 9}`));
  const result = await makeCompactClubPdf({ clubs: [club(months)], fontBytes: await fontBytes(), covers: new Map(), exportedAt: '2027-01-01' });
  assert.equal(await pages(result.bytes), 1);
});

test('compact PDF lists each title once and numbers it in reading order', () => {
  const months = [month('2027-01', 'Dune'), month('2027-02', 'Emma'), month('2027-03', 'Dune'), month('2027-04')];
  months[2].book!.titleId = months[0].book!.titleId = 'dune';
  const links = titleLinks(months);
  assert.deepEqual(links.map((link) => [link.number, link.name]), [[1, 'Dune'], [2, 'Emma']]);
});

test('compact PDF fits a year plus pickup and return months, with the bold font and every option off', async () => {
  const months = [month('2026-12'), ...Array.from({ length: 12 }, (_, index) => ({
    ...month(`2027-${String(index + 1).padStart(2, '0')}`, `Book ${index}`),
    book: { name: `Book ${index}`, author: 'Author', titleId: `t${index}`, priority: index + 1, dates: { ready: '2027-01-01', meeting: '2027-01-22', due: '2027-01-29' } },
  })), month('2028-01')];
  const result = await makeCompactClubPdf({
    clubs: [club(months)], fontBytes: await fontBytes(), boldFontBytes: await boldFontBytes(), covers: new Map(), exportedAt: '2027-01-01',
    options: { showPickup: false, showReturn: false, showPriority: false },
  });
  assert.equal(await pages(result.bytes), 1);
});

test('compact PDF rejects reading plans too long for one page', async () => {
  const months = Array.from({ length: 24 }, (_, index) => month(`${2027 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`, `Book ${index}`));
  await assert.rejects(
    makeCompactClubPdf({ clubs: [club(months)], fontBytes: await fontBytes(), covers: new Map(), exportedAt: '2027-01-01' }),
    /one A4 page/,
  );
});

test('PDF dates read as weekday, day and month regardless of time zone', () => {
  assert.equal(pdfDateLabel('2027-03-10'), 'Wed 10 Mar');
  assert.equal(pdfDateLabel('2027-12-31'), 'Fri 31 Dec');
});

test('reading period spans the shown months', () => {
  assert.equal(readingPeriodLabel([]), '');
  assert.equal(readingPeriodLabel([{ month: '2027-03' }]), 'Mar 2027');
  assert.equal(readingPeriodLabel([{ month: '2027-01' }, { month: '2027-12' }]), 'Jan – Dec 2027');
  assert.equal(readingPeriodLabel([{ month: '2027-11' }, { month: '2028-02' }]), 'Nov 2027 – Feb 2028');
});
