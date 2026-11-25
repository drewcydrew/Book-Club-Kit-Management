import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MemberOverviewMonth } from '../domain/member-calendar';
import { makeClubOverviewPdf, makeCompactClubPdf, overviewPdfMonths, type CompactPdfOptions } from '../domain/club-overview-pdf';
import type { Assignment, Title } from '../domain/model';
import { deliver, boldFontData, fontData, loadCovers } from './export-files';
import { Action, Actions, Label, Note } from './ui';

const compactChoices: { key: keyof CompactPdfOptions; label: string }[] = [
  { key: 'showPickup', label: 'Pickup dates' },
  { key: 'showReturn', label: 'Return dates' },
  { key: 'showPriority', label: 'Priority badges' },
];

export function OverviewExport({ club, details, months, titleFor, priorities }: {
  club: string; details: string; months: MemberOverviewMonth[]; titleFor: (assignment: Assignment) => Title | undefined;
  priorities?: Record<string, Record<string, number>>;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState<CompactPdfOptions>({ showPickup: true, showReturn: true, showPriority: true });
  const toggleOption = (key: keyof CompactPdfOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  async function exportPdf(compact: boolean) {
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
      const [font, boldFont, result] = await Promise.all([fontData(), compact ? boldFontData() : Promise.resolve(undefined), loadCovers(titles)]);
      const input = { clubs: [{ club, details, months: overviewPdfMonths(months, titleFor, priorityFor) }], fontBytes: font, covers: result.covers, exportedAt: date };
      const pdf = compact ? await makeCompactClubPdf({ ...input, boldFontBytes: boldFont, options }) : await makeClubOverviewPdf(input);
      const slug = club.replace(/[^\w-]+/g, '-').toLowerCase() || 'club';
      await deliver(pdf.bytes, `${slug}-${compact ? 'compact-overview' : 'overview'}-${date}.pdf`, 'application/pdf', compact ? 'Save compact overview' : 'Save overview');
      const missing = result.missing + pdf.invalidCovers;
      setMessage(`${compact ? 'Compact overview' : 'Overview'} PDF prepared.${missing ? ` ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : ''}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export the overview.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label>Print overview</Label>
    <Note>A one-page A4 PDF with the covers, assigned books and calendars shown in this overview, for future reference. The compact PDF is a share-ready reading plan: each title&apos;s cover, author and dates, with a colour-matched calendar of the whole year.</Note>
    <Label>Compact PDF includes</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {compactChoices.map((choice) => {
        const checked = options[choice.key];
        return <Pressable key={choice.key} accessibilityRole="checkbox" accessibilityState={{ checked }}
          accessibilityLabel={`Include ${choice.label.toLowerCase()} in compact PDF`} onPress={() => toggleOption(choice.key)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 16, borderWidth: 1, borderColor: '#245e51', borderRadius: 3, backgroundColor: checked ? '#245e51' : 'transparent' }} />
          <Text style={{ fontSize: 13, color: '#465c56' }}>{choice.label}</Text>
        </Pressable>;
      })}
    </View>
    <Actions>
      <Action title={busy ? 'Preparing PDF…' : 'Export overview PDF'} disabled={busy} onPress={() => { void exportPdf(false); }} />
      <Action title={busy ? 'Preparing PDF…' : 'Export compact PDF'} disabled={busy} onPress={() => { void exportPdf(true); }} />
    </Actions>
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export the overview: {error}</Text> : null}
  </View>;
}
