import fontkit from '@pdf-lib/fontkit';
import type { Color, PDFImage } from 'pdf-lib';
import { calendarMonthLabel, type MemberOverviewMonth, type OverviewMarkerKind } from './member-calendar';
import type { Assignment, Title } from './model';
import { shorten, wrap } from './schedule-handouts-pdf';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 28;
const contentWidth = pageWidth - 2 * margin;
const cardHeight = 84;
const cardGap = 10;
const rowGap = 6;
const minScale = 0.6;
const ink = rgb(0.09, 0.23, 0.21);
const muted = rgb(0.27, 0.36, 0.33);
const paper = rgb(0.96, 0.98, 0.96);
const rule = rgb(0.84, 0.88, 0.85);
const cellFill = rgb(1, 0.996, 0.98);
const markedFill = rgb(0.945, 0.969, 0.953);
const placeholder = rgb(0.88, 0.91, 0.89);
const markerKinds: OverviewMarkerKind[] = ['ready', 'meeting', 'due'];
const markerLabels: Record<OverviewMarkerKind, string> = { ready: 'Checkout', meeting: 'Meeting', due: 'Return' };
const markerColors: Record<OverviewMarkerKind, Color> = {
  ready: rgb(0.706, 0.325, 0.035),
  meeting: rgb(0.141, 0.369, 0.318),
  due: rgb(0.604, 0.204, 0.071),
};
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export type OverviewPdfMonth = {
  month: string;
  weeks: (string | null)[][];
  markers: Map<string, OverviewMarkerKind[]>;
  book?: { titleId?: string; name: string; author: string; synopsis: string };
};

export function overviewPdfMonths(months: MemberOverviewMonth[], titleFor: (assignment: Assignment) => Title | undefined): OverviewPdfMonth[] {
  return months.map((entry) => {
    const title = entry.book?.assignment ? titleFor(entry.book.assignment) : undefined;
    const book = entry.book && {
      titleId: title?.id,
      name: title?.name ?? 'Unavailable title',
      author: title?.author ?? '',
      synopsis: title?.synopsis ?? '',
    };
    const markers = new Map([...entry.markers].map(([date, list]) => [date, list.map((marker) => marker.kind)] as const));
    return { month: entry.month, weeks: entry.weeks, markers, book };
  });
}

export async function makeOverviewPdf({ club, details, months, fontBytes, covers, exportedAt }: {
  club: string; details: string; months: OverviewPdfMonth[]; fontBytes: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string;
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const text = [club, details, exportedAt, 'Overview', 'No book chosen', 'No cover', 'No meetings are scheduled for this club.',
    ...Object.values(markerLabels),
    ...months.flatMap((entry) => [calendarMonthLabel(entry.month), entry.book?.name ?? '', entry.book?.author ?? '', entry.book?.synopsis ?? ''])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);

  const images = new Map<string, PDFImage>();
  let invalidCovers = 0;
  for (const [id, bytes] of covers) {
    try {
      images.set(id, bytes[0] === 0xff && bytes[1] === 0xd8 ? await doc.embedJpg(bytes) : await doc.embedPng(bytes));
    } catch { invalidCovers++; }
  }

  const page = doc.addPage([pageWidth, pageHeight]);
  const draw = (value: string, x: number, y: number, size: number, color = ink) => {
    if (value) page.drawText(value, { x, y, size, font, color });
  };
  const drawCentered = (value: string, x: number, width: number, y: number, size: number, color = ink) => {
    draw(value, x + (width - font.widthOfTextAtSize(value, size)) / 2, y, size, color);
  };
  const fitLines = (value: string, size: number, width: number, count: number) =>
    shorten(wrap(value, font, size, width), count, font, size, width);

  page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: ink });
  const top = pageHeight - margin;
  draw(fitLines(club, 16, contentWidth, 1)[0] ?? '', margin, top - 16, 16);
  draw(fitLines(details, 8.5, contentWidth, 1)[0] ?? '', margin, top - 30, 8.5, muted);
  draw(`Exported ${exportedAt}`, margin, top - 41, 7, muted);

  const overviewTop = top - 50;
  const listRows = Math.max(1, Math.ceil(months.length / 2));
  const overviewHeight = 24 + listRows * 11 + 4;
  page.drawRectangle({ x: margin, y: overviewTop - overviewHeight, width: contentWidth, height: overviewHeight, color: paper, borderColor: rule, borderWidth: 0.5 });
  draw('Overview', margin + 8, overviewTop - 12, 8.5);
  let legendRight = margin + contentWidth - 8;
  for (const kind of [...markerKinds].reverse()) {
    const label = markerLabels[kind];
    const labelWidth = font.widthOfTextAtSize(label, 7);
    draw(label, legendRight - labelWidth, overviewTop - 12, 7, muted);
    page.drawCircle({ x: legendRight - labelWidth - 6, y: overviewTop - 9.5, size: 2.5, color: markerColors[kind] });
    legendRight -= labelWidth + 16;
  }
  if (!months.length) draw('No meetings are scheduled for this club.', margin + 8, overviewTop - 24, 8, muted);
  const columnWidth = (contentWidth - 16) / 2;
  months.forEach((entry, index) => {
    const row = Math.floor(index / 2);
    const label = `${calendarMonthLabel(entry.month)} · ${entry.book?.name ?? 'No book chosen'}`;
    draw(fitLines(label, 7.5, columnWidth, 1)[0] ?? '', margin + 8 + (index % 2) * columnWidth, overviewTop - 24 - row * 11, 7.5);
  });

  if (!months.length) return { bytes: await doc.save(), invalidCovers };

  const gridTop = overviewTop - overviewHeight - 10;
  const rows = Math.ceil(months.length / 2);
  const scale = Math.min(1, (gridTop - margin - rowGap * (rows - 1)) / (rows * cardHeight));
  if (scale < minScale) throw new Error('The club overview is too long to fit on one A4 page. Reduce the number of months shown.');
  const cardWidth = ((contentWidth - cardGap) / 2) * scale;
  const cardH = cardHeight * scale;
  const gridLeft = margin + contentWidth * (1 - scale) / 2;

  const drawCard = (entry: OverviewPdfMonth, x: number, yTop: number, k: number) => {
    const bottom = yTop - cardH;
    page.drawRectangle({ x, y: bottom, width: cardWidth, height: cardH, color: paper, borderColor: rule, borderWidth: 0.5 });
    const pad = 5 * k;
    const coverWidth = 34 * k;
    const coverHeight = 46 * k;
    const calendarWidth = 117 * k;
    const calendarX = x + cardWidth - pad - calendarWidth;
    const textX = x + pad + coverWidth + 5 * k;
    const textWidth = calendarX - textX - 6 * k;

    const book = entry.book;
    if (book) {
      const image = book.titleId ? images.get(book.titleId) : undefined;
      if (image) {
        const s = Math.min(coverWidth / image.width, coverHeight / image.height);
        const w = image.width * s;
        const h = image.height * s;
        page.drawImage(image, { x: x + pad + (coverWidth - w) / 2, y: yTop - pad - h, width: w, height: h });
      } else {
        page.drawRectangle({ x: x + pad, y: yTop - pad - coverHeight, width: coverWidth, height: coverHeight, color: placeholder });
        drawCentered('No cover', x + pad, coverWidth, yTop - pad - coverHeight / 2, 5.5 * k, muted);
      }
    }

    let cursor = yTop - pad - 2 * k;
    const line = (value: string, size: number, leading: number, color = ink) => {
      draw(value, textX, cursor - size, size, color);
      cursor -= leading;
    };
    line(calendarMonthLabel(entry.month), 7 * k, 9 * k, muted);
    if (book) {
      fitLines(book.name, 7.5 * k, textWidth, 2).forEach((value) => line(value, 7.5 * k, 9 * k));
      if (book.author) line(fitLines(book.author, 6.5 * k, textWidth, 1)[0] ?? '', 6.5 * k, 8 * k, muted);
      const space = Math.floor((cursor - 6 * k - bottom - pad) / (7 * k)) + 1;
      if (book.synopsis && space > 0) {
        fitLines(book.synopsis, 6 * k, textWidth, space).forEach((value) => line(value, 6 * k, 7 * k, muted));
      }
    } else {
      line('No book chosen', 7 * k, 9 * k, muted);
    }

    const cellWidth = calendarWidth / 7;
    const headerHeight = 8 * k;
    const rowHeight = 11 * k;
    const calendarTop = yTop - pad;
    weekdays.forEach((day, index) => drawCentered(day, calendarX + index * cellWidth, cellWidth, calendarTop - 6 * k, 6 * k, muted));
    entry.weeks.forEach((week, weekIndex) => week.forEach((date, dayIndex) => {
      if (!date) return;
      const cellX = calendarX + dayIndex * cellWidth;
      const cellTop = calendarTop - headerHeight - weekIndex * rowHeight;
      const cellBottom = cellTop - rowHeight;
      const markers = entry.markers.get(date) ?? [];
      page.drawRectangle({ x: cellX, y: cellBottom, width: cellWidth, height: rowHeight, color: markers.length ? markedFill : cellFill, borderColor: rule, borderWidth: 0.4 });
      drawCentered(String(Number(date.slice(8))), cellX, cellWidth, cellTop - 6.5 * k, 6 * k);
      markers.forEach((kind, index) => {
        const centerX = cellX + cellWidth / 2 + (index - (markers.length - 1) / 2) * 4 * k;
        page.drawCircle({ x: centerX, y: cellBottom + 2.6 * k, size: 1.6 * k, color: markerColors[kind] });
      });
    }));
  };

  months.forEach((entry, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    drawCard(entry, gridLeft + col * (cardWidth + cardGap * scale), gridTop - row * (cardH + rowGap), scale);
  });
  return { bytes: await doc.save(), invalidCovers };
}
