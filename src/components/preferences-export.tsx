import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { makePreferencesExport, preferencesCsv } from '../domain/preferences-export';
import { makePreferencesPdf } from '../domain/preferences-pdf';
import { makePreferencesHtml } from '../domain/preferences-html';
import type { PriorityMatrix } from '../domain/cycle-overview';
import type { Cycle, Data } from '../domain/model';
import { deliver, fontData, loadCovers } from './export-files';
import { Action, Actions, Label, Note } from './ui';

export function PreferencesExportActions({ data, cycle, matrix }: { data: Data; cycle: Cycle; matrix: PriorityMatrix }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function exportFile(format: 'csv' | 'pdf' | 'html') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const snapshot = makePreferencesExport(data, cycle, matrix);
      if (!snapshot.clubs.length || !snapshot.titles.length) throw new Error('No visible preferences are available to export.');
      const date = new Date().toISOString().slice(0, 10);
      let content: string | Uint8Array;
      let warning = '';
      if (format === 'csv') content = preferencesCsv(snapshot);
      else if (format === 'html') content = makePreferencesHtml(snapshot, date);
      else {
        const [font, result] = await Promise.all([fontData(), loadCovers(snapshot.titles)]);
        const pdf = await makePreferencesPdf(snapshot, font, result.covers, date);
        const missing = result.missing + pdf.invalidCovers;
        warning = `${missing ? ` ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : ''}${pdf.shortened ? ' Some labels were shortened; CSV contains the full text.' : ''}`;
        content = pdf.bytes;
      }
      await deliver(content, `book-club-preferences-${date}.${format}`, format === 'csv' ? 'text/csv' : format === 'html' ? 'text/html' : 'application/pdf', 'Save preferences');
      setMessage(`${format.toUpperCase()} export prepared.${warning}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export preferences.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || !matrix.clubIds.length || !matrix.rows.length;
  return <View style={{ gap: 8 }}>
    <Label>Export preferences</Label>
    <Note>{cycle.name} · {matrix.clubIds.length} shown clubs · {matrix.rows.length} visible titles. Exports show club rankings, with blank cells for unranked titles. Hidden titles are excluded; reviewing one club does not limit the export.</Note>
    <Actions>
      <Action title={busy ? 'Preparing export…' : 'Export CSV'} disabled={disabled} onPress={() => { void exportFile('csv'); }} />
      <Action title={busy ? 'Preparing export…' : 'Export PDF'} disabled={disabled} onPress={() => { void exportFile('pdf'); }} />
      <Action title={busy ? 'Preparing export…' : 'Export HTML'} disabled={disabled} onPress={() => { void exportFile('html'); }} />
    </Actions>
    <Note>HTML works offline in a browser. Some mobile share previews do not support its interactive controls.</Note>
    {!matrix.clubIds.length ? <Note>Select clubs to export preferences.</Note>
      : !matrix.rows.length ? <Note>No visible titles to export. Restore hidden titles or add preferences.</Note> : null}
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export preferences: {error}</Text> : null}
  </View>;
}
