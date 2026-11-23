import { useState } from 'react';
import { Text, View } from 'react-native';
import type { ScheduleExport } from '../domain/schedule-export';
import { scheduleCsv } from '../domain/schedule-export';
import { makeSchedulePdf } from '../domain/schedule-pdf';
import { Action, Actions, Label, Note } from './ui';
import { deliver, fontData, loadCovers } from './export-files';

type ScheduleExportPreview = {
  label: string;
  mode?: ScheduleExport['mode'];
  hasMeetings: boolean;
  highlight?: { title: string; count: number };
};

type ExportProps = { disabled: boolean; staffClubCount?: number } & (
  | { schedule: ScheduleExport; preview?: never; makeSchedule?: never }
  | { schedule?: never; preview: ScheduleExportPreview; makeSchedule: () => ScheduleExport }
);

export function ScheduleExportActions(props: ExportProps) {
  const { disabled, staffClubCount } = props;
  const preview: ScheduleExportPreview = props.schedule ? {
    label: props.schedule.label, mode: props.schedule.mode, hasMeetings: props.schedule.meetings.length > 0,
    highlight: props.schedule.highlight && { title: props.schedule.highlight.title, count: props.schedule.highlight.rows.length },
  } : props.preview;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function exportFile(format: 'csv' | 'pdf') {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const schedule = props.schedule ?? props.makeSchedule();
      const date = new Date().toISOString().slice(0, 10);
      let content: string | Uint8Array;
      let missing = 0;
      let smallText = false;
      if (format === 'csv') {
        content = scheduleCsv(schedule);
      } else {
        const meetings = schedule.highlight
          ? schedule.highlight.rows.flatMap((row) => row.cells.flatMap((cell) => cell.meeting ? [cell.meeting] : []))
          : schedule.meetings;
        const [font, result] = await Promise.all([fontData(), loadCovers(meetings.filter((row) => row.assignmentId)
          .map((row) => ({ id: row.titleId || `missing:${row.kitId}`, coverUrl: row.coverUrl, isbn: row.isbn })))]);
        missing = result.missing;
        const pdf = await makeSchedulePdf(schedule, font, result.covers, date);
        missing += pdf.invalidCovers;
        smallText = !!pdf.smallText;
        content = pdf.bytes;
      }
      const name = schedule.mode ? `book-club-schedule-${schedule.mode}` : 'book-club-schedule';
      await deliver(content, `${name}-${date}.${format}`, format === 'csv' ? 'text/csv' : 'application/pdf', 'Save schedule');
      const result = schedule.mode ? `${schedule.mode[0].toUpperCase()}${schedule.mode.slice(1)} ${format.toUpperCase()} export prepared.` : 'Export prepared.';
      setMessage(`${result}${missing ? ` ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : ''}${smallText ? ' The grid was scaled to one page; text is smaller than 6 points.' : ''}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export the schedule.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ gap: 8 }}>
    <Label>{preview.mode ? `Export ${preview.mode === 'grid' ? 'Grid' : preview.mode === 'meetings' ? 'Meetings' : 'Kits'}` : 'Export schedule'}</Label>
    <Note>{preview.highlight
      ? 'CSV includes all meetings for the clubs shown, including unassigned meetings.'
      : preview.mode === 'kits'
      ? 'PDF has one page per kit with its allocations on a calendar, plus an appendix of unassigned meetings. CSV includes assigned meetings only.'
      : 'Exports include all meetings for the clubs shown, including unassigned meetings.'} {preview.label}.</Note>
    {staffClubCount !== undefined && <Note>{staffClubCount} {staffClubCount === 1 ? 'club is' : 'clubs are'} selected in Clubs shown. {preview.highlight
      ? `PDF shows ${preview.highlight.count} ${preview.highlight.count === 1 ? 'club' : 'clubs'} matching ${preview.highlight.title} on one page; CSV includes all selected clubs.`
      : 'Title highlighting does not change the CSV selection.'}</Note>}
    <Actions>
      <Action title={busy ? 'Preparing export…' : 'Export CSV'} disabled={disabled || busy || !preview.hasMeetings} onPress={() => { void exportFile('csv'); }} />
      <Action title={busy ? 'Preparing export…' : 'Export PDF'} disabled={disabled || busy || !preview.hasMeetings || (!!preview.highlight && !preview.highlight.count)} onPress={() => { void exportFile('pdf'); }} />
    </Actions>
    {!preview.hasMeetings && <Note>{preview.mode === 'kits' ? 'No assigned kits are available to export for the clubs shown.' : 'No meetings are available to export for the clubs shown.'}</Note>}
    {preview.highlight && !preview.highlight.count && <Note>No shown clubs use this highlighted title. Select another title or clear the highlight to export a PDF.</Note>}
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export schedule: {error}</Text> : null}
  </View>;
}
