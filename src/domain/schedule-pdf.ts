import fontkit from '@pdf-lib/fontkit';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type { ScheduleExport } from './schedule-export';

// The bundled build avoids Metro resolving pdf-lib's ESM tslib wrapper incorrectly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, rgb }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

const width = 595;
const height = 842;
const margin = 40;
const bottom = 45;
const green = rgb(0.09, 0.23, 0.21);
const muted = rgb(0.27, 0.36, 0.33);
const paper = rgb(0.98, 0.98, 0.96);

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

export async function makeSchedulePdf(
  schedule: ScheduleExport,
  fontBytes: Uint8Array,
  covers: Map<string, Uint8Array>,
  exportedAt: string,
): Promise<{ bytes: Uint8Array; invalidCovers: number }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // fontkit's subset has invalid TrueType checksums and renders incorrectly in PDF readers.
  const font = await doc.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const text = [schedule.library, schedule.label, ...schedule.meetings.flatMap((row) =>
    [row.clubName, row.cycleName, row.cycleStatus, row.title, row.author, row.meeting, row.month, row.ready, row.due,
      ...(schedule.mode === 'kits' ? [row.barcode, row.branch, row.kitId] : [])]),
    ...(schedule.grid?.rows.map((row) => row.clubName) ?? [])].join('');
  const unsupported = [...text].find((character) => !/\s/.test(character) && !supported.has(character.codePointAt(0)!));
  if (unsupported) throw new Error(`The PDF font cannot display the character "${unsupported}".`);
  const images = new Map<string, PDFImage>();
  let invalidCovers = 0;
  for (const [id, bytes] of covers) {
    try {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) images.set(id, await doc.embedJpg(bytes));
      else images.set(id, await doc.embedPng(bytes));
    } catch {
      invalidCovers += 1;
    }
  }

  let page: PDFPage = doc.addPage([width, height]);
  let y = 0;
  function startPage() {
    page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: green });
    y = height - margin;
    page.drawText('BOOK CLUB SCHEDULE', { x: margin, y, size: 10, font, color: muted });
    y -= 28;
  }
  function newPage() {
    page = doc.addPage([width, height]);
    startPage();
  }
  function ensure(space: number) {
    if (y - space < bottom) newPage();
  }
  function heading(value: string, size: number, color = green) {
    for (const line of wrap(value, font, size, width - margin * 2)) {
      ensure(size + 8);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 8;
    }
  }
  startPage();
  heading(schedule.library || 'Library', 22);
  heading(schedule.label, 12, muted);
  heading(`Exported ${exportedAt}`, 10, muted);
  y -= 8;

  if (schedule.mode === 'grid' && schedule.grid) {
    const grid = schedule.grid;
    const clubWidth = 105;
    const cellWidth = (width - margin * 2 - clubWidth) / 3;
    for (let offset = 0; offset < grid.months.length; offset += 3) {
      if (offset > 0) newPage();
      const months = grid.months.slice(offset, offset + 3);
      function gridHeader() {
        ensure(60);
        heading('Grid · Title assignments', 14);
        page.drawText('Club', { x: margin + 6, y, size: 10, font, color: green });
        months.forEach((month, index) => page.drawText(month, { x: margin + clubWidth + index * cellWidth + 6, y, size: 10, font, color: green }));
        y -= 18;
      }
      gridHeader();
      for (const row of grid.rows) {
        const cells = row.cells.slice(offset, offset + months.length);
        const clubLines = wrap(row.clubName, font, 10, clubWidth - 12);
        const cellLines = cells.map((cell) => {
          if (!cell) return ['No meeting'];
          if (!cell.assignmentId) return ['Not assigned', ...wrap(cell.meeting || 'Date to be confirmed', font, 9, cellWidth - 12)];
          return [
            ...wrap(cell.title || 'Unavailable title', font, 10, cellWidth - 12),
            ...wrap(cell.author, font, 9, cellWidth - 12),
            ...wrap(cell.meeting ? `Meeting ${cell.meeting}` : 'Date to be confirmed', font, 9, cellWidth - 12),
          ];
        });
        let first = true;
        do {
          const topSpace = first ? 100 : 18;
          let capacity = Math.floor((y - bottom - topSpace - 8) / 12);
          if (capacity < 1) {
            newPage();
            gridHeader();
            capacity = Math.floor((y - bottom - topSpace - 8) / 12);
          }
          const count = Math.min(capacity, Math.max(clubLines.length, ...cellLines.map((lines) => lines.length), 1));
          const cardHeight = topSpace + count * 12;
          page.drawRectangle({ x: margin, y: y - cardHeight, width: width - margin * 2, height: cardHeight, color: paper });
          const clubChunk = clubLines.splice(0, count);
          if (!first && clubChunk.length === 0) clubChunk.push('Continued');
          clubChunk.forEach((line, index) => page.drawText(line, { x: margin + 6, y: y - 16 - index * 12, size: 10, font, color: green }));
          cells.forEach((cell, index) => {
            const x = margin + clubWidth + index * cellWidth;
            if (first) {
              const image = cell?.assignmentId ? images.get(cell.titleId) : undefined;
              if (image) {
                const scale = Math.min(54 / image.width, 78 / image.height);
                page.drawImage(image, { x: x + 6 + (54 - image.width * scale) / 2, y: y - 10 - image.height * scale, width: image.width * scale, height: image.height * scale });
              } else if (cell?.assignmentId) {
                page.drawRectangle({ x: x + 6, y: y - 88, width: 54, height: 78, color: rgb(0.88, 0.91, 0.89) });
                page.drawText('No cover', { x: x + 10, y: y - 50, size: 8, font, color: muted });
              }
            }
            cellLines[index].splice(0, count).forEach((line, lineIndex) => page.drawText(line, {
              x: x + 6, y: y - (first ? 104 : 16) - lineIndex * 12, size: 9, font, color: green,
            }));
          });
          y -= cardHeight + 8;
          first = false;
        } while (clubLines.length || cellLines.some((lines) => lines.length));
      }
    }
  } else {
    let previousGroup = '';
    for (const row of schedule.meetings) {
      const group = schedule.mode === 'kits' ? row.kitId : row.clubId;
      if (group !== previousGroup) {
        ensure(145);
        y -= 8;
        heading(schedule.mode === 'kits' ? `${row.title || 'Unavailable title'} · ${row.barcode || `Unavailable kit (${row.kitId})`}` : row.clubName, 17);
        if (schedule.mode === 'kits' && row.branch) heading(row.branch, 10, muted);
        previousGroup = group;
      }
      const title = row.assignmentId ? (row.title || 'Unavailable title') : 'Not assigned';
      const details = [
        ...(schedule.mode === 'kits' ? [{ text: row.clubName, size: 11 }] : []),
        { text: row.meeting ? `Meeting ${row.meeting}` : `Meeting ${row.month} · Date to be confirmed`, size: 11 },
        { text: title, size: 14 },
        ...(row.author ? [{ text: row.author, size: 10 }] : []),
        { text: `${row.cycleName} · ${row.cycleStatus}`, size: 9 },
        ...(row.ready || row.due ? [{ text: `Ready ${row.ready || '—'}   ·   Due ${row.due || '—'}`, size: 10 }] : []),
      ];
      const lines = details.flatMap((detail) => wrap(detail.text, font, detail.size, width - margin * 2 - 100)
        .map((line) => ({ ...detail, text: line })));
      let first = true;
      while (lines.length) {
        ensure(120);
        const count = Math.min(lines.length, Math.max(1, Math.floor((y - bottom - 24) / 17)));
        const chunk = lines.splice(0, count);
        const cardHeight = Math.max(106, chunk.length * 17 + 20);
        page.drawRectangle({ x: margin, y: y - cardHeight, width: width - margin * 2, height: cardHeight, color: paper });
        const image = first ? images.get(row.titleId) : undefined;
        if (image) {
          const scale = Math.min(60 / image.width, 84 / image.height);
          page.drawImage(image, { x: margin + 10 + (60 - image.width * scale) / 2, y: y - 10 - image.height * scale, width: image.width * scale, height: image.height * scale });
        } else {
          page.drawRectangle({ x: margin + 10, y: y - 94, width: 60, height: 84, color: rgb(0.88, 0.91, 0.89) });
          page.drawText(first ? 'No cover' : 'Continued', { x: margin + 15, y: y - 55, size: 8, font, color: muted });
        }
        let lineY = y - 20;
        for (const line of chunk) {
          page.drawText(line.text, { x: margin + 82, y: lineY, size: line.size, font, color: line.size >= 11 ? green : muted });
          lineY -= 17;
        }
        y -= cardHeight + 10;
        first = false;
      }
    }
  }
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawText(`${index + 1} / ${pages.length}`, { x: width - margin - 35, y: 22, size: 9, font, color: muted });
  });
  return { bytes: await doc.save(), invalidCovers };
}
