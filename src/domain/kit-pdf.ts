import fontkit from '@pdf-lib/fontkit';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { drawCalendarGrid, embedCovers, overviewStyle, shorten, wrap } from './club-overview-pdf';
import type { KitDayMark } from './kit-calendar';
import { calendarMonthLabel, calendarWeeks, type OverviewMarkerKind } from './member-calendar';
import type { ExportMeeting, KitPage, KitPageSchedule } from './schedule-export';

// Use the same Metro-compatible build as the club overview export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const { pageWidth, pageHeight, margin, contentWidth, ink, muted, paper, rule, markedFill, placeholder, markerColors, markerLabels } = overviewStyle;
const markerKinds = Object.keys(markerLabels) as OverviewMarkerKind[];
const kitRed = rgb(0.64, 0.15, 0.15);
const minScale = 0.6;
const cardUnit = 110;
const cardGap = 8;
const columns = 3;
const fixedText = ['Allocations', 'Calendar', 'Overrun', 'Overlapping allocations', 'No cover', 'Unavailable title', 'Unset', 'to',
  'Barcode', 'copy', 'copies', 'Unassigned meetings', 'Date to be confirmed', 'Club', 'Meeting', 'Cycle', 'On loan',
  ...Object.values(markerLabels)];

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  return shorten(wrap(value, font, size, maxWidth), 1, font, size, maxWidth)[0] ?? '';
}

function markerKindsFor(marks: KitDayMark[]): OverviewMarkerKind[] {
  return markerKinds.filter((kind) => marks.some((mark) => mark[kind]));
}

function drawKitPage(page: PDFPage, font: PDFFont, images: Map<string, PDFImage>, kit: KitPage, months: string[], exportedAt: string) {
  const draw = (value: string, x: number, y: number, size: number, color = ink) => {
    if (value) page.drawText(value, { x, y, size, font, color });
  };
  const first = kit.allocations[0];
  const top = pageHeight - margin;
  const coverWidth = 46;
  const coverHeight = 62;
  const coverX = margin + contentWidth - coverWidth;
  const textWidth = contentWidth - coverWidth - 12;

  page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: ink });
  draw(fit(font, first.title || 'Unavailable title', 16, textWidth), margin, top - 16, 16);
  const details = [first.author, first.barcode ? `Barcode ${first.barcode}` : `Unavailable kit (${first.kitId})`, first.branch,
    first.copies === null ? '' : `${first.copies} ${first.copies === 1 ? 'copy' : 'copies'}`].filter(Boolean).join(' · ');
  draw(fit(font, details, 8.5, textWidth), margin, top - 30, 8.5, muted);
  draw(`Exported ${exportedAt}`, margin, top - 41, 7, muted);
  const image = first.titleId ? images.get(first.titleId) : undefined;
  if (image) {
    const scale = Math.min(coverWidth / image.width, coverHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: coverX + (coverWidth - width) / 2, y: top - height, width, height });
  } else {
    page.drawRectangle({ x: coverX, y: top - coverHeight, width: coverWidth, height: coverHeight, color: placeholder });
    draw('No cover', coverX + (coverWidth - font.widthOfTextAtSize('No cover', 5.5)) / 2, top - coverHeight / 2, 5.5, muted);
  }

  const allocTop = top - 72;
  const columnWidth = (contentWidth - 16) / 2;
  const allocRows = Math.ceil(kit.allocations.length / 2);
  const allocHeight = 24 + allocRows * 11 + (kit.summary.overlap ? 15 : 4);
  page.drawRectangle({ x: margin, y: allocTop - allocHeight, width: contentWidth, height: allocHeight, color: paper, borderColor: rule, borderWidth: 0.5 });
  draw('Allocations', margin + 8, allocTop - 12, 8.5);
  kit.allocations.forEach((allocation: ExportMeeting, index) => {
    const x = margin + 8 + (index % 2) * columnWidth;
    const y = allocTop - 24 - Math.floor(index / 2) * 11;
    const overrun = kit.summary.overruns.has(allocation.assignmentId);
    const dates = `${allocation.ready || 'Unset'} to ${allocation.due || 'Unset'}${overrun ? ' · Overrun' : ''}`;
    const datesWidth = font.widthOfTextAtSize(dates, 7);
    draw(dates, x + columnWidth - 8 - datesWidth, y, 7, overrun ? kitRed : muted);
    draw(fit(font, allocation.clubName, 7.5, columnWidth - 16 - datesWidth), x, y, 7.5);
  });
  if (kit.summary.overlap) draw('Overlapping allocations: check this kit before the year is final.', margin + 8, allocTop - allocHeight + 5, 7, kitRed);

  const calendarTop = allocTop - allocHeight - 14;
  draw('Calendar', margin, calendarTop, 10);
  const legend: { label: string; kind?: OverviewMarkerKind }[] = [...markerKinds.map((kind) => ({ label: markerLabels[kind], kind })), { label: 'On loan' }];
  let legendRight = margin + contentWidth;
  for (const item of [...legend].reverse()) {
    const labelWidth = font.widthOfTextAtSize(item.label, 7);
    draw(item.label, legendRight - labelWidth, calendarTop, 7, muted);
    const swatchX = legendRight - labelWidth - 6;
    if (item.kind) page.drawCircle({ x: swatchX, y: calendarTop + 2.5, size: 2.5, color: markerColors[item.kind] });
    else page.drawRectangle({ x: swatchX - 3, y: calendarTop - 0.5, width: 6, height: 6, color: markedFill, borderColor: rule, borderWidth: 0.5 });
    legendRight -= labelWidth + 16;
  }

  const gridTop = calendarTop - 10;
  const rowCount = Math.max(1, Math.ceil(months.length / columns));
  const k = Math.min(1.25, (gridTop - margin - cardGap * (rowCount - 1)) / (rowCount * cardUnit));
  if (k < minScale) throw new Error(`The calendar for ${first.title || 'this kit'} is too long to fit on one A4 page. Reduce the number of months shown.`);
  const cardWidth = (contentWidth - cardGap * (columns - 1)) / columns;
  const cardHeight = cardUnit * k;
  const markers = new Map([...kit.marks].map(([date, list]) => [date, markerKindsFor(list)] as const));
  const shaded = new Set(kit.marks.keys());
  months.forEach((month, index) => {
    const x = margin + (index % columns) * (cardWidth + cardGap);
    const yTop = gridTop - Math.floor(index / columns) * (cardHeight + cardGap);
    page.drawRectangle({ x, y: yTop - cardHeight, width: cardWidth, height: cardHeight, color: paper, borderColor: rule, borderWidth: 0.5 });
    draw(calendarMonthLabel(month), x + 5 * k, yTop - 12.5 * k, 7.5 * k);
    drawCalendarGrid(page, font, calendarWeeks(month), markers, { left: x + 5, top: yTop - 19 * k, width: cardWidth - 10, k, shaded });
  });
}

function drawUnassignedPages(doc: import('pdf-lib').PDFDocument, font: PDFFont, rows: ExportMeeting[], exportedAt: string) {
  const rowHeight = 14;
  const top = pageHeight - margin;
  const listTop = top - 72;
  const perPage = Math.floor((listTop - margin) / rowHeight);
  const meetingWidth = 140;
  const clubX = margin + 150;
  const cycleX = margin + 340;
  const clubWidth = 180;
  const cycleWidth = contentWidth - 340;
  for (let offset = 0; offset < rows.length; offset += perPage) {
    const page = doc.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: ink });
    page.drawText('Unassigned meetings', { x: margin, y: top - 16, size: 16, font, color: ink });
    page.drawText(`Exported ${exportedAt}`, { x: margin, y: top - 30, size: 7, font, color: muted });
    const headerY = top - 56;
    page.drawText('Meeting', { x: margin, y: headerY, size: 7.5, font, color: muted });
    page.drawText('Club', { x: clubX, y: headerY, size: 7.5, font, color: muted });
    page.drawText('Cycle', { x: cycleX, y: headerY, size: 7.5, font, color: muted });
    page.drawLine({ start: { x: margin, y: headerY - 4 }, end: { x: margin + contentWidth, y: headerY - 4 }, color: rule, thickness: 0.5 });
    rows.slice(offset, offset + perPage).forEach((row, index) => {
      const y = listTop - index * rowHeight;
      const meeting = row.meeting || `${calendarMonthLabel(row.month)} · Date to be confirmed`;
      page.drawText(fit(font, meeting, 8.5, meetingWidth), { x: margin, y, size: 8.5, font, color: ink });
      page.drawText(fit(font, row.clubName, 8.5, clubWidth), { x: clubX, y, size: 8.5, font, color: ink });
      page.drawText(fit(font, row.cycleName, 8.5, cycleWidth), { x: cycleX, y, size: 8.5, font, color: muted });
    });
  }
}

export async function makeKitCalendarPdf({ schedule, fontBytes, covers, exportedAt }: {
  schedule: KitPageSchedule; fontBytes: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string;
}) {
  if (!schedule.kits.length) throw new Error('No assigned kits are available to export for the clubs shown.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const rows = [...schedule.kits.flatMap((kit) => kit.allocations), ...schedule.unassigned];
  const text = [exportedAt, ...fixedText, ...schedule.months.map((month) => calendarMonthLabel(month)),
    ...rows.flatMap((row) => [row.title, row.author, row.barcode, row.branch, row.clubName, row.cycleName, row.ready, row.due, row.meeting])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);

  const { images, invalidCovers } = await embedCovers(doc, covers);
  for (const kit of schedule.kits) {
    drawKitPage(doc.addPage([pageWidth, pageHeight]), font, images, kit, schedule.months, exportedAt);
  }
  if (schedule.unassigned.length) drawUnassignedPages(doc, font, schedule.unassigned, exportedAt);
  return { bytes: await doc.save(), invalidCovers };
}
