import fontkit from '@pdf-lib/fontkit';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { preferenceTitleLabel, type PreferencesExport } from './preferences-export';

// Use the bundled build for Metro, as in schedule-pdf.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const pageWidth = 1190.55;
const pageHeight = 841.89;
const margin = 20;
const gridTop = 746;
const titleWidth = 260;
const cellWidth = 85;
const headerHeight = 48;
const rowHeight = 72;
const clubsPerPage = Math.floor((pageWidth - margin * 2 - titleWidth) / cellWidth);
const titlesPerPage = Math.floor((gridTop - headerHeight - margin) / rowHeight);
const green = rgb(0.09, 0.23, 0.21);
const muted = rgb(0.27, 0.36, 0.33);
const border = rgb(0.78, 0.84, 0.81);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function makePreferencesPdf(snapshot: PreferencesExport, fontBytes: Uint8Array, covers: Map<string, Uint8Array>, exportedAt: string):
Promise<{ bytes: Uint8Array; invalidCovers: number; shortened: boolean }> {
  if (!snapshot.clubs.length || !snapshot.titles.length) throw new Error('No visible preferences are available to export.');
  for (const title of snapshot.titles) {
    if (title.cells.length !== snapshot.clubs.length || title.cells.some((cell, index) => cell.clubId !== snapshot.clubs[index].id)) {
      throw new Error('Preference export columns are inconsistent.');
    }
  }
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const strings = [snapshot.library, snapshot.cycleName, snapshot.cycleStatus, exportedAt,
    ...snapshot.clubs.map((club) => club.name), ...snapshot.titles.map(preferenceTitleLabel)];
  const supported = new Set(font.getCharacterSet());
  const unsupported = [...strings.join('')].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);
  const images = new Map<string, PDFImage>();
  let invalidCovers = 0;
  for (const [id, bytes] of covers) {
    try {
      images.set(id, bytes[0] === 0xff && bytes[1] === 0xd8 ? await doc.embedJpg(bytes) : await doc.embedPng(bytes));
    } catch {
      invalidCovers += 1;
    }
  }
  let shortened = false;
  function text(page: PDFPage, value: string, x: number, y: number, size: number, maxWidth: number, maxLines: number, color = green) {
    const lines = wrap(value, font, size, maxWidth);
    const visible = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      shortened = true;
      const last = [...visible[visible.length - 1]];
      while (last.length && font.widthOfTextAtSize(`${last.join('')}…`, size) > maxWidth) last.pop();
      visible[visible.length - 1] = `${last.join('')}…`;
    }
    visible.forEach((line, index) => page.drawText(line, { x, y: y - index * (size + 2), size, font, color }));
  }
  const totalPages = Math.ceil(snapshot.titles.length / titlesPerPage) * Math.ceil(snapshot.clubs.length / clubsPerPage);
  let pageNumber = 0;
  for (let titleOffset = 0; titleOffset < snapshot.titles.length; titleOffset += titlesPerPage) {
    const titles = snapshot.titles.slice(titleOffset, titleOffset + titlesPerPage);
    for (let clubOffset = 0; clubOffset < snapshot.clubs.length; clubOffset += clubsPerPage) {
      const clubs = snapshot.clubs.slice(clubOffset, clubOffset + clubsPerPage);
      const page = doc.addPage([pageWidth, pageHeight]);
      pageNumber += 1;
      text(page, snapshot.library || 'Library', margin, pageHeight - 29, 13, pageWidth - margin * 2, 1);
      text(page, `Preferences · ${snapshot.cycleName} · ${snapshot.cycleStatus}`, margin, pageHeight - 47, 10, pageWidth - margin * 2, 1);
      text(page, `Exported ${exportedAt} · Titles ${titleOffset + 1}-${titleOffset + titles.length} of ${snapshot.titles.length} · Clubs ${clubOffset + 1}-${clubOffset + clubs.length} of ${snapshot.clubs.length} · Page ${pageNumber} of ${totalPages}`,
        margin, pageHeight - 63, 9, pageWidth - margin * 2, 1, muted);
      text(page, 'Title', margin + 4, gridTop - 14, 10, titleWidth - 8, 1);
      clubs.forEach((club, index) => {
        const x = margin + titleWidth + index * cellWidth;
        text(page, club.name, x + 3, gridTop - 12, 9, cellWidth - 6, 3);
      });
      titles.forEach((title, rowIndex) => {
        const top = gridTop - headerHeight - rowIndex * rowHeight;
        const y = top - rowHeight;
        page.drawRectangle({ x: margin, y, width: titleWidth + clubs.length * cellWidth,
          height: rowHeight, borderColor: border, borderWidth: 0.5 });
        const image = images.get(title.id);
        if (image) {
          const factor = Math.min(38 / image.width, 56 / image.height);
          page.drawImage(image, { x: margin + 4, y: top - 4 - image.height * factor,
            width: image.width * factor, height: image.height * factor });
        } else {
          page.drawRectangle({ x: margin + 4, y: top - 60, width: 38, height: 56, color: rgb(0.89, 0.91, 0.90) });
          text(page, 'No cover', margin + 5, top - 33, 8, 36, 2, muted);
        }
        text(page, preferenceTitleLabel(title), margin + 46, top - 14, 10, titleWidth - 50, 4);
        clubs.forEach((_, column) => {
          const cell = title.cells[clubOffset + column];
          const x = margin + titleWidth + column * cellWidth;
          page.drawLine({ start: { x, y }, end: { x, y: top }, thickness: 0.5, color: border });
          if (cell.rank !== null) text(page, String(cell.rank), x + 4, top - 16, 10, cellWidth - 8, 1);
        });
      });
    }
  }
  return { bytes: await doc.save(), invalidCovers, shortened };
}
