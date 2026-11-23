import fontkit from '@pdf-lib/fontkit';
import type { Color, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { cadenceLabel } from './cadence';
import { meetingRuleLabel } from './meeting-rule';
import { calendarMonthLabel, type MemberOverviewMonth, type OverviewMarkerKind } from './member-calendar';
import type { Assignment, Club, Title } from './model';

// Use the same Metro-compatible build as the existing schedule PDF.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 28;
const contentWidth = pageWidth - 2 * margin;
const cardHeight = 96;
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
const markerLabels: Record<OverviewMarkerKind, string> = { ready: 'Pickup', meeting: 'Meeting', due: 'Return' };
const markerColors: Record<OverviewMarkerKind, Color> = {
  ready: rgb(0.706, 0.325, 0.035),
  meeting: rgb(0.141, 0.369, 0.318),
  due: rgb(0.604, 0.204, 0.071),
};
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Shared with the kit calendar export so both PDFs use one visual style.
export const overviewStyle = {
  pageWidth, pageHeight, margin, contentWidth, ink, muted, paper, rule, cellFill, markedFill, placeholder,
  markerColors, markerLabels, weekdays,
};

export type OverviewPdfMonth = {
  month: string;
  weeks: (string | null)[][];
  markers: Map<string, OverviewMarkerKind[]>;
  book?: { titleId?: string; name: string; author: string };
};

export type ClubOverviewPdfClub = { club: string; details: string; months: OverviewPdfMonth[] };

export function overviewClubDetails(club: Pick<Club, 'branch' | 'meetingWeekday' | 'meetingOccurrence' | 'cadence'>): string {
  return `${club.branch} · ${meetingRuleLabel(club)} · ${cadenceLabel(club.cadence)}`;
}

export function overviewPdfMonths(months: MemberOverviewMonth[], titleFor: (assignment: Assignment) => Title | undefined): OverviewPdfMonth[] {
  return months.map((entry) => {
    const title = entry.book?.assignment ? titleFor(entry.book.assignment) : undefined;
    const book = entry.book && {
      titleId: title?.id,
      name: title?.name ?? 'Unavailable title',
      author: title?.author ?? '',
    };
    const markers = new Map([...entry.markers].map(([date, list]) => [date, list.map((marker) => marker.kind)] as const));
    return { month: entry.month, weeks: entry.weeks, markers, book };
  });
}

export function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of value.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
    if (line) result.push(line);
    line = '';
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) { result.push(line); line = ''; }
      line += character;
    }
  }
  if (line) result.push(line);
  return result;
}

export function shorten(lines: string[], count: number, font: PDFFont, size: number, maxWidth: number): string[] {
  if (lines.length <= count) return lines;
  if (!count) return [];
  const visible = lines.slice(0, count);
  let last = visible[count - 1];
  while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = [...last].slice(0, -1).join('');
  visible[count - 1] = `${last.trimEnd()}…`;
  return visible;
}

// Produces one A4 page per club, all sharing one embedded font and cover set.
export async function embedCovers(doc: import('pdf-lib').PDFDocument, covers: Map<string, Uint8Array>) {
  const images = new Map<string, PDFImage>();
  let invalidCovers = 0;
  for (const [id, bytes] of covers) {
    try {
      images.set(id, bytes[0] === 0xff && bytes[1] === 0xd8 ? await doc.embedJpg(bytes) : await doc.embedPng(bytes));
    } catch { invalidCovers++; }
  }
  return { images, invalidCovers };
}

export async function makeClubOverviewPdf({ clubs, fontBytes, covers, exportedAt }: {
  clubs: ClubOverviewPdfClub[]; fontBytes: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string;
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const text = [exportedAt, 'Overview', 'No book chosen', 'No cover', 'No meetings are scheduled for this club.',
    ...Object.values(markerLabels),
    ...clubs.flatMap((club) => [club.club, club.details, ...club.months.flatMap((entry) => [calendarMonthLabel(entry.month), entry.book?.name ?? '', entry.book?.author ?? ''])])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);

  const { images, invalidCovers } = await embedCovers(doc, covers);

  for (const club of clubs) {
    drawClubPage(doc.addPage([pageWidth, pageHeight]), font, images, { ...club, exportedAt });
  }
  return { bytes: await doc.save(), invalidCovers };
}

// Draws a Monday-first month grid. Shaded dates are filled like marked dates without a marker.
export function drawCalendarGrid(page: PDFPage, font: PDFFont, weeks: (string | null)[][], markers: Map<string, OverviewMarkerKind[]>,
  { left, top, width, k, shaded }: { left: number; top: number; width: number; k: number; shaded?: Set<string> }) {
  const cellWidth = width / 7;
  const headerHeight = 8 * k;
  const rowHeight = 13 * k;
  const centered = (value: string, x: number, y: number, size: number, color: Color) => {
    page.drawText(value, { x: x + (cellWidth - font.widthOfTextAtSize(value, size)) / 2, y, size, font, color });
  };
  weekdays.forEach((day, index) => centered(day, left + index * cellWidth, top - 6.5 * k, 6.5 * k, muted));
  weeks.forEach((week, weekIndex) => week.forEach((date, dayIndex) => {
    if (!date) return;
    const cellX = left + dayIndex * cellWidth;
    const cellTop = top - headerHeight - weekIndex * rowHeight;
    const cellBottom = cellTop - rowHeight;
    const dayMarkers = markers.get(date) ?? [];
    const filled = dayMarkers.length > 0 || !!shaded?.has(date);
    page.drawRectangle({ x: cellX, y: cellBottom, width: cellWidth, height: rowHeight, color: filled ? markedFill : cellFill, borderColor: rule, borderWidth: 0.4 });
    centered(String(Number(date.slice(8))), cellX, cellTop - 7 * k, 7 * k, ink);
    dayMarkers.forEach((kind, index) => {
      const centerX = cellX + cellWidth / 2 + (index - (dayMarkers.length - 1) / 2) * 4.5 * k;
      page.drawCircle({ x: centerX, y: cellBottom + 2.8 * k, size: 1.8 * k, color: markerColors[kind] });
    });
  }));
}

function drawClubPage(page: PDFPage, font: PDFFont, images: Map<string, PDFImage>, { club, details, months, exportedAt }: ClubOverviewPdfClub & { exportedAt: string }) {
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

  if (!months.length) return;

  const gridTop = overviewTop - overviewHeight - 10;
  const rows = Math.ceil(months.length / 2);
  const scale = Math.min(1, (gridTop - margin - rowGap * (rows - 1)) / (rows * cardHeight));
  if (scale < minScale) throw new Error(`The overview for ${club} is too long to fit on one A4 page. Reduce the number of months shown.`);
  const cardWidth = ((contentWidth - cardGap) / 2) * scale;
  const cardH = cardHeight * scale;
  const gridLeft = margin + contentWidth * (1 - scale) / 2;

  const drawCard = (entry: OverviewPdfMonth, x: number, yTop: number, k: number) => {
    const bottom = yTop - cardH;
    page.drawRectangle({ x, y: bottom, width: cardWidth, height: cardH, color: paper, borderColor: rule, borderWidth: 0.5 });
    const pad = 5 * k;
    const coverWidth = 36 * k;
    const coverHeight = 50 * k;
    const calendarWidth = 130 * k;
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
      fitLines(book.name, 8 * k, textWidth, 3).forEach((value) => line(value, 8 * k, 10 * k));
      if (book.author) line(fitLines(book.author, 7 * k, textWidth, 2)[0] ?? '', 7 * k, 9 * k, muted);
    } else {
      line('No book chosen', 7 * k, 9 * k, muted);
    }

    drawCalendarGrid(page, font, entry.weeks, entry.markers, { left: calendarX, top: yTop - pad, width: calendarWidth, k });
  };

  months.forEach((entry, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    drawCard(entry, gridLeft + col * (cardWidth + cardGap * scale), gridTop - row * (cardH + rowGap), scale);
  });
}
