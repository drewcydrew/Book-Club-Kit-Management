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
const maxCardHeight = 150;
const minDayRowHeight = 8.2;
const overviewBottom = 33;
const cardGap = 10;
const rowGap = 6;
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

export type OverviewPdfDates = { ready?: string; meeting?: string; due?: string };

export type OverviewPdfMonth = {
  month: string;
  weeks: (string | null)[][];
  markers: Map<string, OverviewMarkerKind[]>;
  // Which title (by key) owns each marker, so the compact calendar can colour days to match covers.
  markerOwners?: Map<string, Partial<Record<OverviewMarkerKind, string>>>;
  book?: { titleId?: string; name: string; author: string; priority?: number | null; dates?: OverviewPdfDates };
};

const unavailableTitle = 'Unavailable title';
const titleKey = (titleId: string | undefined, name: string) => titleId ?? `unlinked:${name}`;

export type ClubOverviewPdfClub = { club: string; details: string; months: OverviewPdfMonth[] };

export function overviewClubDetails(club: Pick<Club, 'branch' | 'meetingWeekday' | 'meetingOccurrence' | 'cadence'>): string {
  return `${club.branch} · ${meetingRuleLabel(club)} · ${cadenceLabel(club.cadence)}`;
}

// priorityFor omitted: no badges. Returning null shows "—" for an unranked title.
export function overviewPdfMonths(months: MemberOverviewMonth[], titleFor: (assignment: Assignment) => Title | undefined,
  priorityFor?: (assignment: Assignment) => number | null): OverviewPdfMonth[] {
  return months.map((entry) => {
    const title = entry.book?.assignment ? titleFor(entry.book.assignment) : undefined;
    const assignment = entry.book?.assignment;
    const book = entry.book && {
      titleId: title?.id,
      name: title?.name ?? unavailableTitle,
      author: title?.author ?? '',
      priority: assignment && priorityFor ? priorityFor(assignment) : undefined,
      dates: assignment && { ready: assignment.ready, meeting: assignment.meeting, due: assignment.due },
    };
    const markers = new Map([...entry.markers].map(([date, list]) => [date, list.map((marker) => marker.kind)] as const));
    const markerOwners = new Map([...entry.markers].map(([date, list]) => {
      const owners: Partial<Record<OverviewMarkerKind, string>> = {};
      for (const marker of list) {
        const owner = marker.meeting.assignment ? titleFor(marker.meeting.assignment) : undefined;
        if (marker.meeting.assignment) owners[marker.kind] = titleKey(owner?.id, owner?.name ?? unavailableTitle);
      }
      return [date, owners] as const;
    }));
    return { month: entry.month, weeks: entry.weeks, markers, markerOwners, book };
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

async function clubPdfDocument(clubs: ClubOverviewPdfClub[], fontBytes: Uint8Array, covers: Map<string, Uint8Array>, exportedAt: string,
  { boldFontBytes, logoBytes, extraText = [] }: { boldFontBytes?: Uint8Array; logoBytes?: Uint8Array; extraText?: string[] } = {}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const bold = boldFontBytes ? await doc.embedFont(boldFontBytes) : font;
  const supported = new Set(font.getCharacterSet());
  const text = [exportedAt, 'Overview', 'No book chosen', 'No cover', 'No meetings are scheduled for this club.', '#', '—',
    ...Object.values(markerLabels), ...extraText,
    ...clubs.flatMap((club) => [club.club, club.details, ...club.months.flatMap((entry) => [calendarMonthLabel(entry.month), entry.book?.name ?? '', entry.book?.author ?? ''])])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);

  const { images, invalidCovers } = await embedCovers(doc, covers);
  // The logo is branding only; an unreadable image is skipped rather than failing the export.
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => undefined) : undefined;
  return { doc, font, bold, images, invalidCovers, logo };
}

export async function makeClubOverviewPdf({ clubs, fontBytes, boldFontBytes, logoBytes, covers, exportedAt, options = defaultClubPdfOptions }: {
  clubs: ClubOverviewPdfClub[]; fontBytes: Uint8Array; boldFontBytes?: Uint8Array; logoBytes?: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string; options?: ClubPdfOptions;
}) {
  const { doc, font, bold, images, invalidCovers, logo } = await clubPdfDocument(clubs, fontBytes, covers, exportedAt, { boldFontBytes, logoBytes });
  for (const club of clubs) {
    drawClubPage(doc.addPage([pageWidth, pageHeight]), { regular: font, bold }, images, { ...club, exportedAt }, options, logo);
  }
  return { bytes: await doc.save(), invalidCovers };
}

// Each distinct title gets a colour in the order it is first read. Books without a title id are still listed, without a cover.
export type TitleLink = {
  key: string; titleId?: string; number: number; name: string; author?: string; priority?: number | null; dates?: OverviewPdfDates;
};

export function titleLinks(months: OverviewPdfMonth[]): TitleLink[] {
  const links = new Map<string, TitleLink>();
  for (const entry of months) {
    const book = entry.book;
    if (!book) continue;
    const key = titleKey(book.titleId, book.name);
    if (!links.has(key)) {
      links.set(key, { key, titleId: book.titleId, number: links.size + 1, name: book.name, author: book.author, priority: book.priority, dates: book.dates });
    }
  }
  return [...links.values()];
}

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2027-03-10" -> "Wed 10 Mar", independent of the device time zone.
export function pdfDateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${weekdayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${shortMonths[month - 1]}`;
}

// "Jan – Dec 2027", or "Nov 2027 – Feb 2028" across a year boundary.
export function readingPeriodLabel(months: Pick<OverviewPdfMonth, 'month'>[]): string {
  if (!months.length) return '';
  const first = months[0].month;
  const last = months[months.length - 1].month;
  const name = (month: string) => shortMonths[Number(month.slice(5, 7)) - 1];
  if (first === last) return `${name(first)} ${first.slice(0, 4)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${name(first)} – ${name(last)} ${last.slice(0, 4)}`;
  return `${name(first)} ${first.slice(0, 4)} – ${name(last)} ${last.slice(0, 4)}`;
}

export type ClubPdfOptions = { showPriority: boolean; showPickup: boolean; showReturn: boolean };
export const defaultClubPdfOptions: ClubPdfOptions = { showPriority: true, showPickup: true, showReturn: true };

// The elements a user can switch off in either PDF layout, in display order.
export const clubPdfOptionChoices: { key: keyof ClubPdfOptions; label: string }[] = [
  { key: 'showPickup', label: 'Pickup dates' },
  { key: 'showReturn', label: 'Return dates' },
  { key: 'showPriority', label: 'Priority badges' },
];

// Meetings always show; pickup and return follow the options.
export function shownMarkerKinds(options: ClubPdfOptions): OverviewMarkerKind[] {
  return markerKinds.filter((kind) => kind === 'meeting' || (kind === 'ready' ? options.showPickup : options.showReturn));
}

export type ClubPdfFormat = 'overview' | 'compact';

export type ClubPdfInput = { clubs: ClubOverviewPdfClub[]; fontBytes: Uint8Array; boldFontBytes?: Uint8Array; logoBytes?: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string };

// One entry point for both layouts, so every screen that exports club PDFs picks a format the same way.
export function makeClubPdf(format: ClubPdfFormat, input: ClubPdfInput, options: ClubPdfOptions = defaultClubPdfOptions) {
  return format === 'compact' ? makeCompactClubPdf({ ...input, options }) : makeClubOverviewPdf({ ...input, options });
}

const compactText = ['READING PLAN', 'Titles', 'Calendar', 'colours match each cover', 'Exported', ...weekdayNames, ...shortMonths, '–', '·', '…'];

// Compact layout: a header band, a grid of title cards (cover, author and dates), then a colour-matched calendar.
export async function makeCompactClubPdf({ clubs, fontBytes, boldFontBytes, logoBytes, covers, exportedAt, options = defaultClubPdfOptions }: {
  clubs: ClubOverviewPdfClub[]; fontBytes: Uint8Array; boldFontBytes?: Uint8Array; logoBytes?: Uint8Array; covers: Map<string, Uint8Array>; exportedAt: string; options?: ClubPdfOptions;
}) {
  const { doc, font, bold, images, invalidCovers, logo } = await clubPdfDocument(clubs, fontBytes, covers, exportedAt, { boldFontBytes, logoBytes, extraText: compactText });
  for (const club of clubs) {
    drawCompactClubPage(doc.addPage([pageWidth, pageHeight]), { regular: font, bold }, images, { ...club, exportedAt }, options, logo);
  }
  return { bytes: await doc.save(), invalidCovers };
}

// Draws a Monday-first month grid. Shaded dates are filled like marked dates without a marker.
export function drawCalendarGrid(page: PDFPage, font: PDFFont, weeks: (string | null)[][], markers: Map<string, OverviewMarkerKind[]>,
  { left, top, width, k, shaded, rowHeight = 13 * k }: { left: number; top: number; width: number; k: number; shaded?: Set<string>; rowHeight?: number }) {
  const cellWidth = width / 7;
  const headerHeight = 8 * k;
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

function drawClubPage(page: PDFPage, fonts: PdfFonts, images: Map<string, PDFImage>, { club, details, months, exportedAt }: ClubOverviewPdfClub & { exportedAt: string }, options: ClubPdfOptions, logo?: PDFImage) {
  const { regular, bold } = fonts;
  const draw = (value: string, x: number, y: number, size: number, color: Color = slateInk, face: PDFFont = regular) => {
    if (value) page.drawText(value, { x, y, size, font: face, color });
  };
  const drawCentered = (value: string, x: number, width: number, y: number, size: number, color: Color = slateMuted) => {
    draw(value, x + (width - regular.widthOfTextAtSize(value, size)) / 2, y, size, color);
  };
  const fitLines = (value: string, size: number, width: number, count: number, face: PDFFont = regular) =>
    shorten(wrap(value, face, size, width), count, face, size, width);

  const links = titleLinks(months);
  const linkByKey = new Map(links.map((link) => [link.key, link] as const));
  const hueFor = titleHueLookup(links);
  const shownKinds = shownMarkerKinds(options);
  drawPageHeader(page, fonts, { club, details, months, links, showDetails: false, logo });
  drawPageFooter(page, regular, club, exportedAt);

  const contentTop = pageHeight - slimBandHeight - stripeHeight - 10;
  if (!months.length) {
    draw(details, margin, contentTop - 10, 9, slateMuted);
    draw('No meetings are scheduled for this club.', margin, contentTop - 24, 9, slateMuted);
    return;
  }
  // The meeting details take the heading row, truncated to leave room for the legend.
  const headingY = contentTop - 9;
  const legendWidth = markerKinds.reduce((sum, kind) => sum + regular.widthOfTextAtSize(markerLabels[kind], 7) + 23, 0);
  drawSectionHeading(page, bold, fitLines(details, 10, contentWidth - legendWidth - 24, 1, bold)[0] ?? '', headingY);
  drawLegend(page, fonts, shownKinds, headingY);

  const gridTop = contentTop - 20;
  const rows = Math.ceil(months.length / 2);
  const cardH = Math.min(maxCardHeight, (gridTop - overviewBottom - rowGap * (rows - 1)) / rows);
  const cardWidth = (contentWidth - cardGap) / 2;
  const pad = 5;
  const leftWidth = 66;
  const calendarLeft = pad + leftWidth + 8;
  const dayWidth = (cardWidth - calendarLeft - pad) / 7;
  const monthHeader = 13;
  const weekdayRow = 8;
  const fittedRowHeight = (cardH - 2 * pad - monthHeader - weekdayRow) / 6;
  if (fittedRowHeight < minDayRowHeight) throw new Error(`The overview for ${club} is too long to fit on one A4 page. Reduce the number of months shown.`);
  const rowHeight = Math.min(22, fittedRowHeight);
  const labelSize = Math.max(5, Math.min(7.5, rowHeight * 0.52));

  const drawPriorityBadge = (coverRight: number, coverTop: number, priority: number | null) => {
    const label = priority === null ? '—' : `#${priority}`;
    const size = 6;
    const labelWidth = bold.widthOfTextAtSize(label, size);
    const radius = Math.max(6.5, labelWidth / 2 + 2);
    const centerX = coverRight - 2;
    const centerY = coverTop - 2;
    page.drawCircle({ x: centerX, y: centerY, size: radius, color: slateInk, borderColor: white, borderWidth: 0.8 });
    page.drawText(label, { x: centerX - labelWidth / 2, y: centerY - size * 0.35, size, font: bold, color: white });
  };

  const drawCard = (entry: OverviewPdfMonth, x: number, yTop: number) => {
    roundedRect(page, x, yTop - cardH, cardWidth, cardH, 5, { color: white, borderColor: slateLine, borderWidth: 0.8 });
    const book = entry.book;
    const link = book && linkByKey.get(titleKey(book.titleId, book.name));
    const leftX = x + pad;
    if (book) {
      const titleLines = fitLines(book.name, 7.6, leftWidth, cardH >= 100 ? 3 : 2, bold);
      const authorLines = book.author ? fitLines(book.author, 6.6, leftWidth, 1) : [];
      const textHeight = titleLines.length * 9 + authorLines.length * 8.4 + 5;
      const boxHeight = Math.min(cardH - 2 * pad - textHeight, leftWidth * 50 / 36);
      const boxWidth = Math.min(leftWidth, boxHeight * 36 / 50);
      const image = book.titleId ? images.get(book.titleId) : undefined;
      let coverWidth = boxWidth;
      let coverHeight = boxHeight;
      const coverBottom = (height: number) => yTop - pad - height;
      if (image) {
        const s = Math.min(boxWidth / image.width, boxHeight / image.height);
        coverWidth = image.width * s;
        coverHeight = image.height * s;
        page.drawImage(image, { x: leftX, y: coverBottom(coverHeight), width: coverWidth, height: coverHeight });
        page.drawRectangle({ x: leftX, y: coverBottom(coverHeight), width: coverWidth, height: coverHeight, borderColor: slateLine, borderWidth: 0.6 });
      } else {
        page.drawRectangle({ x: leftX, y: coverBottom(coverHeight), width: coverWidth, height: coverHeight, color: link ? hueTint(linkHue(link), 0.14) : placeholder });
        drawCentered('No cover', leftX, coverWidth, yTop - pad - coverHeight / 2 - 2, 5.5, slateMuted);
      }
      if (book.priority !== undefined && options.showPriority) drawPriorityBadge(leftX + coverWidth, yTop - pad, book.priority);
      const textColor = link ? hueFill(linkHue(link)) : slateInk;
      let cursor = coverBottom(coverHeight) - 5;
      for (const value of titleLines) { cursor -= 9; draw(value, leftX, cursor + 1.8, 7.6, textColor, bold); }
      for (const value of authorLines) { cursor -= 8.4; draw(value, leftX, cursor + 1.8, 6.6, textColor); }
    } else if (!entry.markers.size) {
      draw('No book chosen', leftX, yTop - pad - 8, 6.6, slateFaint);
    }

    const calendarX = x + calendarLeft;
    const monthLabel = fitLines(calendarMonthLabel(entry.month), 8.5, dayWidth * 7, 1, bold)[0] ?? '';
    draw(monthLabel, calendarX, yTop - pad - 8, 8.5, slateInk, bold);
    drawDayGrid(page, fonts, entry, shownKinds, hueFor, {
      left: calendarX, top: yTop - pad - monthHeader, dayWidth, rowHeight, weekdayRow, labelSize, weekdaySize: 5.6,
    });
  };

  months.forEach((entry, index) => {
    drawCard(entry, margin + (index % 2) * (cardWidth + cardGap), gridTop - Math.floor(index / 2) * (cardH + rowGap));
  });
}

type Hue = readonly [number, number, number];
const accentHue: Hue = [0.263, 0.22, 0.792];
const neutralHue: Hue = [0.28, 0.33, 0.41];
// Print-safe hues, ordered so neighbouring titles stay distinct.
const titleHues: Hue[] = [
  [0.012, 0.412, 0.631], [0.882, 0.114, 0.282], [0.02, 0.588, 0.412], [0.706, 0.325, 0.035],
  [0.494, 0.133, 0.808], [0.059, 0.463, 0.431], [0.859, 0.153, 0.467], [0.918, 0.345, 0.047],
  [0.055, 0.455, 0.565], [0.302, 0.486, 0.059], [0.635, 0.11, 0.686], [0.341, 0.325, 0.306],
];
const slateInk = rgb(0.067, 0.094, 0.153);
const slateMuted = rgb(0.42, 0.45, 0.5);
const slateFaint = rgb(0.64, 0.67, 0.71);
const slateLine = rgb(0.89, 0.9, 0.92);
const white = rgb(1, 1, 1);
const hueFill = (hue: Hue) => rgb(hue[0], hue[1], hue[2]);
const hueTint = (hue: Hue, strength: number) => rgb(1 - (1 - hue[0]) * strength, 1 - (1 - hue[1]) * strength, 1 - (1 - hue[2]) * strength);
const linkHue = (link: TitleLink): Hue => titleHues[(link.number - 1) % titleHues.length];

// Maps a title key to its colour; days owned by an unknown title use a neutral slate.
function titleHueLookup(links: TitleLink[]) {
  const byKey = new Map(links.map((link) => [link.key, link] as const));
  return (key?: string): Hue => {
    const link = key ? byKey.get(key) : undefined;
    return link ? linkHue(link) : neutralHue;
  };
}

// x/y is the bottom-left corner, like drawRectangle.
function roundedRect(page: PDFPage, x: number, y: number, width: number, height: number, radius: number,
  style: { color?: Color; borderColor?: Color; borderWidth?: number }) {
  const r = Math.min(radius, width / 2, height / 2);
  const path = `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} `
    + `H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: y + height, ...style });
}

type PdfFonts = { regular: PDFFont; bold: PDFFont };

// One day cell: a solid rounded square for meetings, an outline for pickups and a tint for returns.
function drawMarkerCell(page: PDFPage, fonts: PdfFonts, kind: OverviewMarkerKind, x: number, y: number, size: number, hue: Hue, label?: string, labelSize = 6.8) {
  const radius = Math.min(3, size / 3);
  if (kind === 'meeting') roundedRect(page, x, y, size, size, radius, { color: hueFill(hue) });
  else if (kind === 'ready') roundedRect(page, x, y, size, size, radius, { color: white, borderColor: hueFill(hue), borderWidth: 1.1 });
  else roundedRect(page, x, y, size, size, radius, { color: hueTint(hue, 0.24) });
  if (label) {
    const width = fonts.bold.widthOfTextAtSize(label, labelSize);
    page.drawText(label, { x: x + (size - width) / 2, y: y + size / 2 - labelSize * 0.35, size: labelSize, font: fonts.bold, color: kind === 'meeting' ? white : hueFill(hue) });
  }
}

// Weekday row and day cells for one month. `top` is the top of the weekday row; `hueFor` maps a title key to its colour.
function drawDayGrid(page: PDFPage, fonts: PdfFonts, month: Pick<OverviewPdfMonth, 'weeks' | 'markers' | 'markerOwners'>,
  shownKinds: OverviewMarkerKind[], hueFor: (key?: string) => Hue,
  { left, top, dayWidth, rowHeight, weekdayRow = 9, labelSize = 6.8, weekdaySize = 5.8 }:
  { left: number; top: number; dayWidth: number; rowHeight: number; weekdayRow?: number; labelSize?: number; weekdaySize?: number }) {
  const centered = (value: string, x: number, y: number, size: number, color: Color, face: PDFFont) => {
    page.drawText(value, { x: x + (dayWidth - face.widthOfTextAtSize(value, size)) / 2, y, size, font: face, color });
  };
  weekdays.forEach((day, index) => centered(day, left + index * dayWidth, top - weekdaySize - 0.7, weekdaySize, slateFaint, fonts.bold));
  month.weeks.forEach((week, weekIndex) => week.forEach((date, dayIndex) => {
    if (!date) return;
    const cellX = left + dayIndex * dayWidth;
    const cellY = top - weekdayRow - (weekIndex + 1) * rowHeight;
    const label = String(Number(date.slice(8)));
    const kinds = (month.markers.get(date) ?? []).filter((kind) => shownKinds.includes(kind));
    const primary = (['meeting', 'due', 'ready'] as const).find((kind) => kinds.includes(kind));
    if (!primary) {
      centered(label, cellX, cellY + rowHeight / 2 - labelSize * 0.35, labelSize, dayIndex >= 5 ? slateFaint : slateMuted, fonts.regular);
      return;
    }
    const owners = month.markerOwners?.get(date);
    const size = Math.min(dayWidth, rowHeight) - 1.6;
    const boxX = cellX + (dayWidth - size) / 2;
    const boxY = cellY + (rowHeight - size) / 2;
    drawMarkerCell(page, fonts, primary, boxX, boxY, size, hueFor(owners?.[primary]), label, labelSize);
    const secondary = kinds.find((kind) => kind !== primary);
    if (secondary) page.drawCircle({ x: boxX + size - 0.5, y: boxY + size - 0.5, size: 1.9, color: hueFill(hueFor(owners?.[secondary])), borderColor: white, borderWidth: 0.6 });
  }));
}

const compactBottom = 36;
const bandHeight = 76;
// Without the details line the band can be shorter, which the overview uses to save space.
const slimBandHeight = 60;
const stripeHeight = 3;

// Indigo header band with a stripe of the title colours beneath it; shared by the overview and compact pages.
// With a logo, a white badge holds it at the right and the reading period moves up beside the kicker.
function drawPageHeader(page: PDFPage, fonts: PdfFonts, { club, details, months, links, showDetails = true, logo }:
  { club: string; details: string; months: OverviewPdfMonth[]; links: TitleLink[]; showDetails?: boolean; logo?: PDFImage }) {
  const { regular, bold } = fonts;
  const height = showDetails ? bandHeight : slimBandHeight;
  const fit = (value: string, size: number, width: number, face: PDFFont) => shorten(wrap(value, face, size, width), 1, face, size, width)[0] ?? '';
  page.drawRectangle({ x: 0, y: pageHeight - height, width: pageWidth, height, color: hueFill(accentHue) });
  (links.length ? links.map(linkHue) : [accentHue]).forEach((hue, index, all) => page.drawRectangle({
    x: pageWidth * index / all.length, y: pageHeight - height - stripeHeight, width: pageWidth / all.length, height: stripeHeight, color: hueFill(hue),
  }));
  const period = readingPeriodLabel(months.filter((entry) => entry.book));
  const badgeHeight = Math.min(height - 16, 44);
  const badgeWidth = logo ? badgeHeight * logo.width / logo.height : 0;
  const badgeLeft = pageWidth - margin - badgeWidth;
  const periodWidth = period && !logo ? bold.widthOfTextAtSize(period, 12) + 16 : 0;
  const nameY = showDetails ? 50 : 45;
  const kicker = logo && period ? `READING PLAN  ·  ${period}` : 'READING PLAN';
  page.drawText(kicker, { x: margin, y: pageHeight - (showDetails ? 25 : 19), size: 7.5, font: bold, color: rgb(0.78, 0.79, 0.98) });
  page.drawText(fit(club, 22, (logo ? badgeLeft - 16 - margin : contentWidth) - periodWidth, bold), { x: margin, y: pageHeight - nameY, size: 22, font: bold, color: white });
  if (showDetails) page.drawText(fit(details, 9, contentWidth, regular), { x: margin, y: pageHeight - 66, size: 9, font: regular, color: rgb(0.84, 0.85, 0.99) });
  if (logo) {
    roundedRect(page, badgeLeft, pageHeight - (height + badgeHeight) / 2, badgeWidth, badgeHeight, 6, { color: white });
    page.drawImage(logo, { x: badgeLeft, y: pageHeight - (height + badgeHeight) / 2, width: badgeWidth, height: badgeHeight });
  } else if (period) {
    page.drawText(period, { x: pageWidth - margin - bold.widthOfTextAtSize(period, 12), y: pageHeight - nameY, size: 12, font: bold, color: white });
  }
}

function drawPageFooter(page: PDFPage, font: PDFFont, club: string, exportedAt: string) {
  page.drawLine({ start: { x: margin, y: 28 }, end: { x: pageWidth - margin, y: 28 }, thickness: 0.5, color: slateLine });
  const name = shorten(wrap(club, font, 6.8, contentWidth / 2), 1, font, 6.8, contentWidth / 2)[0] ?? '';
  page.drawText(name, { x: margin, y: 17, size: 6.8, font, color: slateMuted });
  const exported = `Exported ${exportedAt}`;
  page.drawText(exported, { x: pageWidth - margin - font.widthOfTextAtSize(exported, 6.8), y: 17, size: 6.8, font, color: slateMuted });
}

// Accent-bar section heading; returns the x where the heading text ends.
function drawSectionHeading(page: PDFPage, bold: PDFFont, label: string, y: number) {
  page.drawRectangle({ x: margin, y: y - 2, width: 3, height: 11, color: hueFill(accentHue) });
  page.drawText(label, { x: margin + 9, y, size: 10, font: bold, color: slateInk });
  return margin + 9 + bold.widthOfTextAtSize(label, 10);
}

// Right-aligned legend of the marker shapes in use.
function drawLegend(page: PDFPage, fonts: PdfFonts, kinds: OverviewMarkerKind[], y: number) {
  let right = pageWidth - margin;
  for (const kind of [...kinds].reverse()) {
    const label = markerLabels[kind];
    const labelX = right - fonts.regular.widthOfTextAtSize(label, 7);
    page.drawText(label, { x: labelX, y, size: 7, font: fonts.regular, color: slateMuted });
    drawMarkerCell(page, fonts, kind, labelX - 13, y - 2, 9, accentHue);
    right = labelX - 13 - 10;
  }
}

function drawCompactClubPage(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, images: Map<string, PDFImage>,
  { club, details, months, exportedAt }: ClubOverviewPdfClub & { exportedAt: string }, options: ClubPdfOptions, logo?: PDFImage) {
  const { regular, bold } = fonts;
  const draw = (value: string, x: number, y: number, size: number, color: Color = slateInk, face: PDFFont = regular) => {
    if (value) page.drawText(value, { x, y, size, font: face, color });
  };
  const textWidth = (value: string, size: number, face: PDFFont = regular) => face.widthOfTextAtSize(value, size);
  const drawCentered = (value: string, x: number, width: number, y: number, size: number, color: Color = slateInk, face: PDFFont = regular) => {
    draw(value, x + (width - textWidth(value, size, face)) / 2, y, size, color, face);
  };
  const fitLines = (value: string, size: number, width: number, count: number, face: PDFFont = regular) =>
    shorten(wrap(value, face, size, width), count, face, size, width);

  const links = titleLinks(months);
  const linkByKey = new Map(links.map((link) => [link.key, link] as const));
  const hueFor = titleHueLookup(links);
  const shownKinds = shownMarkerKinds(options);

  drawPageHeader(page, fonts, { club, details, months, links, showDetails: false, logo });
  drawPageFooter(page, regular, club, exportedAt);

  const contentTop = pageHeight - slimBandHeight - stripeHeight - 14;
  if (!months.length) {
    draw(details, margin, contentTop - 10, 9, slateMuted);
    draw('No meetings are scheduled for this club.', margin, contentTop - 24, 9, slateMuted);
    return;
  }
  const drawHeading = (label: string, y: number) => drawSectionHeading(page, bold, label, y);

  // Title cards: cover, name, author and the dates to remember.
  drawHeading('Titles', contentTop - 9);
  const gridTop = contentTop - 20;
  const coverColumns = Math.max(1, Math.min(links.length, 6));
  const coverRows = Math.max(1, Math.ceil(links.length / coverColumns));
  const coverGap = 8;
  const dateRowCount = links.some((link) => link.dates) ? 1 + (options.showPickup ? 1 : 0) + (options.showReturn ? 1 : 0) : 0;
  const captionHeight = 4 + 10 + 2 * 9 + 8.4 + (dateRowCount ? 2 + dateRowCount * 8 : 0) + 4;
  const coverBudget = (gridTop - compactBottom - 34) * 0.48;
  const slotWidth = (contentWidth - coverGap * (coverColumns - 1)) / coverColumns;
  const boxHeight = Math.min(190, slotWidth * 50 / 36, (coverBudget - coverRows * captionHeight - coverGap * (coverRows - 1)) / coverRows);
  if (boxHeight < 40) throw new Error(`The overview for ${club} has too many titles to fit on one A4 page. Reduce the number of months shown.`);
  const boxWidth = Math.min(boxHeight * 36 / 50, slotWidth);
  const coversBottom = gridTop - coverRows * (boxHeight + captionHeight) - coverGap * (coverRows - 1);

  links.forEach((link, index) => {
    const hue = linkHue(link);
    const slotX = margin + (index % coverColumns) * (slotWidth + coverGap);
    const boxBottom = gridTop - Math.floor(index / coverColumns) * (boxHeight + captionHeight + coverGap) - boxHeight;
    const image = link.titleId ? images.get(link.titleId) : undefined;
    let coverWidth = boxWidth;
    let coverHeight = boxHeight;
    if (image) {
      const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
      coverWidth = image.width * scale;
      coverHeight = image.height * scale;
      page.drawImage(image, { x: slotX, y: boxBottom, width: coverWidth, height: coverHeight });
      page.drawRectangle({ x: slotX, y: boxBottom, width: coverWidth, height: coverHeight, borderColor: slateLine, borderWidth: 0.6 });
    } else {
      page.drawRectangle({ x: slotX, y: boxBottom, width: coverWidth, height: coverHeight, color: hueTint(hue, 0.14) });
      drawCentered('No cover', slotX, coverWidth, boxBottom + coverHeight / 2 - 2, 6, slateMuted);
    }
    if (link.priority !== undefined && options.showPriority) {
      const label = link.priority === null ? '—' : `#${link.priority}`;
      const radius = Math.max(6.5, textWidth(label, 6.6, bold) / 2 + 2.5);
      const centerX = slotX + coverWidth - radius - 2;
      const centerY = boxBottom + coverHeight - radius - 2;
      page.drawCircle({ x: centerX, y: centerY, size: radius, color: slateInk, borderColor: white, borderWidth: 0.8 });
      draw(label, centerX - textWidth(label, 6.6, bold) / 2, centerY - 6.6 * 0.35, 6.6, white, bold);
    }

    let y = boxBottom - 10;
    for (const line of fitLines(link.name, 7.8, slotWidth, 2, bold)) {
      draw(line, slotX, y, 7.8, hueFill(hue), bold);
      y -= 9;
    }
    if (link.author) {
      draw(fitLines(link.author, 6.9, slotWidth, 1)[0] ?? '', slotX, y, 6.9, hueFill(hue));
      y -= 8.4;
    }
    y -= 2;
    const dateRows = ([['ready', link.dates?.ready, options.showPickup], ['meeting', link.dates?.meeting, true], ['due', link.dates?.due, options.showReturn]] as const)
      .filter(([, date, shown]) => shown && date);
    const labelWidth = textWidth(markerLabels.meeting, 6.9, bold) + 4;
    for (const [kind, date] of dateRows) {
      draw(markerLabels[kind], slotX, y, 6.9, hueFill(hue), bold);
      draw(pdfDateLabel(date!), slotX + labelWidth, y, 6.9, kind === 'meeting' ? slateInk : slateMuted, kind === 'meeting' ? bold : regular);
      y -= 8;
    }
  });

  // Calendar: one tile per month; meeting days are solid, pickups outlined, returns tinted, all in the title's colour.
  const headingY = coversBottom - 16;
  const legendWidth = shownKinds.reduce((sum, kind) => sum + regular.widthOfTextAtSize(markerLabels[kind], 7) + 23, 0);
  drawHeading(fitLines(details, 10, contentWidth - legendWidth - 24, 1, bold)[0] ?? '', headingY);
  drawLegend(page, fonts, shownKinds, headingY);
  const calendarTop = coversBottom - 26;
  const calendarHeight = calendarTop - compactBottom;
  const gap = 8;
  const columns = [4, 5, 6].find((count) => Math.ceil(months.length / count) <= 3) ?? 6;
  const rows = Math.ceil(months.length / columns);
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;
  const pad = 6;
  const tileHeader = 27;
  const weekdayRow = 9;
  const maxRowHeight = 20;
  // Tiles stop growing once their day rows reach maxRowHeight, so short years don't get stretched, empty tiles.
  const tileHeight = Math.min(tileHeader + weekdayRow + 6 * maxRowHeight + pad - 2, (calendarHeight - gap * (rows - 1)) / rows);
  if (tileHeight < 92) throw new Error(`The overview for ${club} is too long to fit on one A4 page. Reduce the number of months shown.`);
  const dayWidth = (tileWidth - 2 * pad) / 7;
  const rowHeight = Math.min(maxRowHeight, (tileHeight - tileHeader - weekdayRow - pad + 2) / 6);

  months.forEach((entry, index) => {
    const tileX = margin + (index % columns) * (tileWidth + gap);
    const tileTop = calendarTop - Math.floor(index / columns) * (tileHeight + gap);
    roundedRect(page, tileX, tileTop - tileHeight, tileWidth, tileHeight, 5, { color: white, borderColor: slateLine, borderWidth: 0.8 });

    const book = entry.book;
    const link = book && linkByKey.get(titleKey(book.titleId, book.name));
    draw(fitLines(calendarMonthLabel(entry.month), 8.5, tileWidth - 2 * pad, 1, bold)[0] ?? '', tileX + pad, tileTop - pad - 7, 8.5, slateInk, bold);
    draw(book ? fitLines(book.name, 6.6, tileWidth - 2 * pad, 1)[0] ?? '' : entry.markers.size ? '' : 'No book chosen', tileX + pad, tileTop - pad - 18, 6.6,
      book ? (link ? hueFill(linkHue(link)) : slateMuted) : slateFaint);

    drawDayGrid(page, fonts, entry, shownKinds, hueFor, {
      left: tileX + pad, top: tileTop - tileHeader, dayWidth, rowHeight, weekdayRow,
    });
  });
}

