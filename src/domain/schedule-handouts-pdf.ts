import { zipSync } from 'fflate';

// Use the same Metro-compatible build as the existing schedule PDF.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument }: typeof import('pdf-lib') = require('pdf-lib/dist/pdf-lib.js');

export async function handoutsZip(pdfBytes: Uint8Array, clubNames: string[]): Promise<Uint8Array> {
  const combined = await PDFDocument.load(pdfBytes);
  if (combined.getPageCount() !== clubNames.length) throw new Error('Handout pages do not match the selected clubs.');
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < clubNames.length; index++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(combined, [index]);
    single.addPage(page);
    const name = clubNames[index].normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'club';
    files[`${String(index + 1).padStart(3, '0')}-${name}.pdf`] = await single.save();
  }
  return zipSync(files, { level: 0 });
}
