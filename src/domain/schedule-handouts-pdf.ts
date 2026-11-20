import fontkit from '@pdf-lib/fontkit';
import { zipSync } from 'fflate';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type { HandoutSnapshot } from './schedule-handouts';

// Use the same Metro-compatible build as the existing schedule PDF.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const width = 595.28;
const height = 841.89;
const margin = 32;
const ink = rgb(0.09, 0.23, 0.21);
const muted = rgb(0.27, 0.36, 0.33);
const paper = rgb(0.96, 0.98, 0.96);

function displayDate(value: string): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return `${date[3]}-${date[2]}-${date[1]}`;
  const month = /^(\d{4})-(\d{2})( · Date to be confirmed)$/.exec(value);
  return month ? `${month[2]}-${month[1]}${month[3]}` : value;
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

function shorten(lines: string[], count: number, font: PDFFont, size: number, maxWidth: number): string[] {
  if (lines.length <= count) return lines;
  if (!count) return [];
  const visible = lines.slice(0, count);
  let last = visible[count - 1];
  while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = [...last].slice(0, -1).join('');
  visible[count - 1] = `${last.trimEnd()}…`;
  return visible;
}

export async function makeHandoutsPdf(snapshot: HandoutSnapshot, fontBytes: Uint8Array, covers: Map<string, Uint8Array>, exportedAt: string) {
  if (!snapshot.clubs.length) throw new Error('Select at least one club in Clubs shown.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const text = [snapshot.library, snapshot.cycle, snapshot.status, ...snapshot.clubs.flatMap((club) =>
    [club.name, ...club.meetings.flatMap((meeting) => [meeting.date, meeting.title, meeting.author, meeting.synopsis])])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);
  const images = new Map<string, PDFImage>();
  let invalidCovers = 0;
  for (const [id, bytes] of covers) {
    try {
      images.set(id, bytes[0] === 0xff && bytes[1] === 0xd8 ? await doc.embedJpg(bytes) : await doc.embedPng(bytes));
    } catch { invalidCovers++; }
  }
  const tooLarge: string[] = [];
  const shortened: string[] = [];
  const cardWidth = (width - 2 * margin - 12) / 2;
  const textWidth = cardWidth - 66;
  const draw = (page: PDFPage, value: string, x: number, y: number, size: number, color = ink) => {
    if (value) page.drawText(value, { x, y, size, font, color });
  };
  for (const club of snapshot.clubs) {
    const headings = [snapshot.library || 'Library', club.name, snapshot.cycle, `${snapshot.status}${snapshot.unsaved ? ' · UNSAVED LOCAL SCHEDULE' : ''}`];
    const headingLines = headings.map((value) => wrap(value, font, 10, width - margin * 2));
    if (headingLines.some((lines) => lines.length > 2)) { tooLarge.push(club.name); continue; }
    const headerHeight = 32 + headingLines.reduce((sum, lines) => sum + lines.length * 13, 0);
    const top = height - margin - headerHeight;
    const rowCount = Math.ceil(club.meetings.length / 2);
    const cardHeight = rowCount ? Math.min(115, (top - margin - 20 - (rowCount - 1) * 6) / rowCount) : 0;
    const layout = club.meetings.map((meeting) => {
      const date = wrap(displayDate(meeting.date), font, 8, textWidth);
      const title = wrap(meeting.title, font, 9, textWidth);
      const author = wrap(meeting.author ? `by ${meeting.author}` : '', font, 8, textWidth);
      const synopsis = wrap(meeting.synopsis || (meeting.assigned ? 'No description available.' : ''), font, 8, textWidth);
      const available = Math.floor((cardHeight - 14 - (date.length + title.length + author.length) * 10) / 10);
      return { date, title, author, synopsis, available };
    });
    if ((rowCount > 0 && cardHeight < 72) || layout.some((item) => item.available < 0)) { tooLarge.push(club.name); continue; }
    const page = doc.addPage([width, height]);
    let clubShortened = false;
    page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: ink });
    let headingY = height - margin - 10;
    headingLines.forEach((lines, index) => {
      lines.forEach((line) => { draw(page, line, margin, headingY, 10, index === 3 ? muted : ink); headingY -= 13; });
    });
    draw(page, `Exported ${displayDate(exportedAt)}`, margin, headingY, 8, muted);
    if (!club.meetings.length) draw(page, 'No meetings are scheduled for this club.', margin, top - 20, 10, muted);
    club.meetings.forEach((meeting, index) => {
      const row = Math.floor(index / 2);
      const x = margin + (index % 2) * (cardWidth + 12);
      const y = top - row * (cardHeight + 6) - cardHeight;
      page.drawRectangle({ x, y, width: cardWidth, height: cardHeight, color: paper });
      const image = images.get(meeting.titleId);
      const coverHeight = Math.min(70, cardHeight - 12);
      if (image) {
        const scale = Math.min(48 / image.width, coverHeight / image.height);
        page.drawImage(image, { x: x + 6 + (48 - image.width * scale) / 2, y: y + cardHeight - 6 - image.height * scale, width: image.width * scale, height: image.height * scale });
      } else {
        page.drawRectangle({ x: x + 6, y: y + cardHeight - 6 - coverHeight, width: 48, height: coverHeight, color: rgb(0.88, 0.91, 0.89) });
        draw(page, meeting.assigned ? 'No cover' : 'Unassigned', x + 8, y + cardHeight - 25, 7, muted);
      }
      const item = layout[index];
      let lineY = y + cardHeight - 14;
      const line = (value: string, size: number, color = ink) => { draw(page, value, x + 60, lineY, size, color); lineY -= 10; };
      item.date.forEach((value) => line(value, 8, muted));
      item.title.forEach((value) => line(value, 9));
      item.author.forEach((value) => line(value, 8, muted));
      const description = shorten(item.synopsis, Math.max(0, item.available), font, 8, textWidth);
      if (description.length < item.synopsis.length) clubShortened = true;
      description.forEach((value) => line(value, 8, muted));
    });
    if (clubShortened) {
      shortened.push(club.name);
      draw(page, 'Some descriptions are shortened or omitted to fit this page.', margin, margin, 8, muted);
    }
  }
  if (tooLarge.length) throw new Error(`Handouts cannot fit legibly on one page for: ${tooLarge.join(', ')}. Reduce the number of meetings or shorten title details.`);
  return { bytes: await doc.save(), shortened, invalidCovers };
}

export async function handoutsZip(pdfBytes: Uint8Array, clubs: HandoutSnapshot['clubs']): Promise<Uint8Array> {
  const combined = await PDFDocument.load(pdfBytes);
  if (combined.getPageCount() !== clubs.length) throw new Error('Handout pages do not match the selected clubs.');
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < clubs.length; index++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(combined, [index]);
    single.addPage(page);
    const name = clubs[index].name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'club';
    files[`${String(index + 1).padStart(3, '0')}-${name}.pdf`] = await single.save();
  }
  return zipSync(files, { level: 0 });
}
