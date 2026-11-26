import { makeClubPdf, type ClubOverviewPdfClub, type ClubPdfFormat, type CompactPdfOptions } from '../domain/club-overview-pdf';
import { boldFontData, fontData, loadCovers, logoData } from './export-files';

export const formatLabels: Record<ClubPdfFormat, string> = { overview: 'Overview', compact: 'Compact' };

// Shared by the club-schedule and schedule screens: loads fonts, logo and covers, then builds the chosen layout.
export async function buildClubPdf({ format, clubs, covers, options }: {
  format: ClubPdfFormat; clubs: ClubOverviewPdfClub[]; covers: readonly { id: string; coverUrl: string; isbn: string }[]; options?: CompactPdfOptions;
}) {
  // The logo is branding only, so a failure to load it must not block the export.
  const [font, boldFont, logo, loaded] = await Promise.all([fontData(), boldFontData(), logoData().catch(() => undefined), loadCovers(covers)]);
  const exportedAt = new Date().toISOString().slice(0, 10);
  const pdf = await makeClubPdf(format, { clubs, fontBytes: font, boldFontBytes: boldFont, logoBytes: logo, covers: loaded.covers, exportedAt }, options);
  return { bytes: pdf.bytes, missing: loaded.missing + pdf.invalidCovers, date: exportedAt };
}

export function coverMissingNote(missing: number): string {
  return missing ? ` ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : '';
}
