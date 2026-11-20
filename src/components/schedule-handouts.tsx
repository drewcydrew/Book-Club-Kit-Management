import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Cycle, Data } from '../domain/model';
import { makeHandoutSnapshot } from '../domain/schedule-handouts';
import { handoutsZip, makeHandoutsPdf } from '../domain/schedule-handouts-pdf';
import { deliver, fontData, loadCovers } from './export-files';
import { Action, Actions, Label, Note } from './ui';

export function ScheduleHandouts({ data, cycle, clubIds, unsaved, pending, disabled }: {
  data: Data; cycle: Cycle; clubIds: string[]; unsaved: boolean; pending: boolean; disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function generate(format: 'pdf' | 'zip') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const snapshot = makeHandoutSnapshot(data, cycle, clubIds, unsaved);
      const date = new Date().toISOString().slice(0, 10);
      const titles = snapshot.clubs.flatMap((club) => club.meetings.filter((meeting) => meeting.assigned)
        .map((meeting) => ({ id: meeting.titleId, coverUrl: meeting.coverUrl, isbn: meeting.isbn })));
      const [font, result] = await Promise.all([fontData(), loadCovers(titles)]);
      const pdf = await makeHandoutsPdf(snapshot, font, result.covers, date);
      const content = format === 'zip' ? await handoutsZip(pdf.bytes, snapshot.clubs) : pdf.bytes;
      await deliver(content, `book-club-handouts-${date}.${format}`, format === 'zip' ? 'application/zip' : 'application/pdf', 'Save handouts');
      const missing = result.missing + pdf.invalidCovers;
      setMessage(`Handouts prepared.${missing ? ` ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : ''}${pdf.shortened.length ? ` Descriptions were shortened or omitted for: ${pdf.shortened.join(', ')}.` : ''}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate handouts.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label>Generate handouts</Label>
    <Note>One page per shown club for {cycle.name}, regardless of the selected view or title highlight. Include unassigned meetings. Choose a combined PDF or a ZIP of separate PDFs.</Note>
    {unsaved && <Note>These handouts include unsaved local schedule changes and will be marked accordingly. Check them before sharing.</Note>}
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
