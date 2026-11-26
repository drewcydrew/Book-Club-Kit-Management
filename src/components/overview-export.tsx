import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { MemberOverviewMonth } from '../domain/member-calendar';
import { overviewPdfMonths, type ClubPdfFormat } from '../domain/club-overview-pdf';
import type { Assignment, Title } from '../domain/model';
import { buildClubPdf, coverMissingNote } from './club-pdf-export';
import { ClubPdfOptionsPicker, useClubPdfOptions } from './club-pdf-options';
import { deliver } from './export-files';
import { Action, Actions, Label, Note } from './ui';

export function OverviewExport({ club, details, months, titleFor, priorities }: {
  club: string; details: string; months: MemberOverviewMonth[]; titleFor: (assignment: Assignment) => Title | undefined;
  priorities?: Record<string, Record<string, number>>;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { options, toggle } = useClubPdfOptions();
  async function exportPdf(format: ClubPdfFormat) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const titles = months.flatMap((entry) => {
        const title = entry.book?.assignment ? titleFor(entry.book.assignment) : undefined;
        return title ? [{ id: title.id, coverUrl: title.coverUrl ?? '', isbn: title.isbn }] : [];
      });
      const priorityFor = priorities && ((assignment: Assignment) => priorities[assignment.cycleId]?.[titleFor(assignment)?.id ?? ''] ?? null);
      const pdf = await buildClubPdf({
        format, covers: titles, options,
        clubs: [{ club, details, months: overviewPdfMonths(months, titleFor, priorityFor) }],
      });
      const slug = club.replace(/[^\w-]+/g, '-').toLowerCase() || 'club';
      const compact = format === 'compact';
      await deliver(pdf.bytes, `${slug}-${compact ? 'compact-overview' : 'overview'}-${pdf.date}.pdf`, 'application/pdf', compact ? 'Save compact overview' : 'Save overview');
      setMessage(`${compact ? 'Compact overview' : 'Overview'} PDF prepared.${coverMissingNote(pdf.missing)}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export the overview.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label>Print overview</Label>
    <Note>A one-page A4 PDF with the covers, assigned books and calendars shown in this overview, for future reference. The compact PDF is a share-ready reading plan: each title&apos;s cover, author and dates, with a colour-matched calendar of the whole year. The checkboxes below apply to both PDFs.</Note>
    <ClubPdfOptionsPicker options={options} onToggle={toggle} />
    <Actions>
      <Action title={busy ? 'Preparing PDF…' : 'Export overview PDF'} disabled={busy} onPress={() => { void exportPdf('overview'); }} />
      <Action title={busy ? 'Preparing PDF…' : 'Export compact PDF'} disabled={busy} onPress={() => { void exportPdf('compact'); }} />
    </Actions>
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export the overview: {error}</Text> : null}
  </View>;
}
