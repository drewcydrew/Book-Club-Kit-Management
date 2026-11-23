import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { calendarWeeks } from '../src/domain/member-calendar';
import { makeOverviewPdf, type OverviewPdfMonth } from '../src/domain/member-overview-pdf';

const fontBytes = () => readFile('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');

function month(value: string, book?: string): OverviewPdfMonth {
  return {
    month: value,
    weeks: calendarWeeks(value),
    markers: new Map([[`${value}-15`, ['ready', 'meeting']], [`${value}-22`, ['due']]]),
    book: book ? { name: book, author: 'Author' } : undefined,
  };
}

const options = { club: 'Thursday Readers', details: 'Central · Monday · Monthly', exportedAt: '2027-01-01' };

async function pages(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

test('overview PDF fits a normal club on one page', async () => {
  const months = [month('2027-01', 'The Miller Women'), month('2027-02'), month('2027-03', 'Dune'), month('2027-04', 'Emma')];
  const result = await makeOverviewPdf({ ...options, months, fontBytes: await fontBytes(), covers: new Map() });
  assert.equal(await pages(result.bytes), 1);
  assert.equal(result.invalidCovers, 0);
});

test('overview PDF is one page for a club with no meetings', async () => {
  const result = await makeOverviewPdf({ ...options, months: [], fontBytes: await fontBytes(), covers: new Map() });
  assert.equal(await pages(result.bytes), 1);
});

test('overview PDF rejects overviews too long for one page', async () => {
  const months = Array.from({ length: 24 }, (_, index) => month(`2027-${String(index % 12 + 1).padStart(2, '0')}`, `Book ${index}`));
  await assert.rejects(makeOverviewPdf({ ...options, months, fontBytes: await fontBytes(), covers: new Map() }), /one A4 page/);
});
