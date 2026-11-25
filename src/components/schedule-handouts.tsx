import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { ClubPdfFormat } from '../domain/club-overview-pdf';
import { today } from '../domain/dates';
import type { Cycle, Data } from '../domain/model';
import { makeHandoutClubs } from '../domain/schedule-handouts';
import { handoutsZip } from '../domain/schedule-handouts-pdf';
import { buildClubPdf, coverMissingNote, formatLabels } from './club-pdf-export';
import { CompactOptionsPicker, useCompactOptions } from './compact-pdf-options';
import { deliver } from './export-files';
import { Action, Actions, Label, Note } from './ui';

const formats: ClubPdfFormat[] = ['overview', 'compact'];

export function ScheduleHandouts({ data, cycle, clubIds, unsaved, pending, disabled }: {
  data: Data; cycle: Cycle; clubIds: string[]; unsaved: boolean; pending: boolean; disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [format, setFormat] = useState<ClubPdfFormat>('overview');
  const { options, toggle } = useCompactOptions();
  async function generate(fileFormat: 'pdf' | 'zip') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const { clubs, covers } = makeHandoutClubs(data, cycle, clubIds, today());
      const pdf = await buildClubPdf({ format, clubs, covers, options });
      const content = fileFormat === 'zip' ? await handoutsZip(pdf.bytes, clubs.map((club) => club.club)) : pdf.bytes;
      const suffix = format === 'compact' ? '-compact' : '';
      await deliver(content, `book-club-handouts${suffix}-${pdf.date}.${fileFormat}`, fileFormat === 'zip' ? 'application/zip' : 'application/pdf', 'Save handouts');
      setMessage(`${format === 'compact' ? 'Compact handouts' : 'Handouts'} prepared.${coverMissingNote(pdf.missing)}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate handouts.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label>Generate handouts</Label>
    <Note>One page per shown club for {cycle.name}, regardless of the selected view or title highlight. Unassigned meetings are included. Choose the Overview or Compact layout, then a combined PDF or a ZIP of separate PDFs.</Note>
    <Actions>
      {formats.map((value) => <Action key={value} selected={value === format} title={`${formatLabels[value]} layout`} disabled={busy} onPress={() => setFormat(value)} />)}
    </Actions>
    {format === 'compact' && <CompactOptionsPicker options={options} onToggle={toggle} />}
    {unsaved && <Note>These handouts include unsaved local schedule changes. Check them before sharing.</Note>}
    {pending && <Note>Unapplied editor selections are not included. Apply them first if needed.</Note>}
    <Actions>
      <Action title={busy ? 'Preparing handouts…' : 'Combined PDF'} disabled={disabled || busy || !clubIds.length} onPress={() => { void generate('pdf'); }} />
      <Action title={busy ? 'Preparing handouts…' : 'Separate PDFs (ZIP)'} disabled={disabled || busy || !clubIds.length} onPress={() => { void generate('zip'); }} />
    </Actions>
    {!clubIds.length && <Note>Select clubs in Clubs shown to generate handouts.</Note>}
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to generate handouts: {error}</Text> : null}
  </View>;
}
