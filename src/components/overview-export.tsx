import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { MemberOverviewMonth } from '../domain/member-calendar';
import { makeClubOverviewPdf, overviewPdfMonths } from '../domain/club-overview-pdf';
import type { Assignment, Title } from '../domain/model';
import { deliver, fontData, loadCovers } from './export-files';
import { Action, Actions, Label, Note } from './ui';

export function OverviewExport({ club, details, months, titleFor, priorities }: {
  club: string; details: string; months: MemberOverviewMonth[]; titleFor: (assignment: Assignment) => Title | undefined;
  priorities?: Record<string, Record<string, number>>;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function exportPdf() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      const titles = months.flatMap((entry) => {
        const title = entry.book?.assignment ? titleFor(entry.book.assignment) : undefined;
        return title ? [{ id: title.id, coverUrl: title.coverUrl ?? '', isbn: title.isbn }] : [];
      });
      const priorityFor = priorities && ((assignment: Assignment) => priorities[assignment.cycleId]?.[titleFor(assignment)?.id ?? ''] ?? null);
      const [font, result] = await Promise.all([fontData(), loadCovers(titles)]);
      const pdf = await makeClubOverviewPdf({
        clubs: [{ club, details, months: overviewPdfMonths(months, titleFor, priorityFor) }], fontBytes: font, covers: result.covers, exportedAt: date,
      });
      await deliver(pdf.bytes, `${club.replace(/[^\w-]+/g, '-').toLowerCase() || 'club'}-overview-${date}.pdf`, 'application/pdf', 'Save overview');
      const missing = result.missing + pdf.invalidCovers;
      setMessage(missing ? `Overview PDF prepared. ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : 'Overview PDF prepared.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export the overview.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label>Print overview</Label>
    <Note>A one-page A4 PDF with the covers, assigned books and calendars shown in this overview, for future reference.</Note>
    <Actions>
      <Action title={busy ? 'Preparing PDF…' : 'Export overview PDF'} disabled={busy} onPress={() => { void exportPdf(); }} />
    </Actions>
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export the overview: {error}</Text> : null}
  </View>;
}
