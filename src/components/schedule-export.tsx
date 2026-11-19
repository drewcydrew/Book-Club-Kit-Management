import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ScheduleExport } from '../domain/schedule-export';
import { scheduleCsv } from '../domain/schedule-export';
import { makeSchedulePdf } from '../domain/schedule-pdf';
import { fetchIsbnCover } from '../state/api';
import { Action, Actions, Label, Note } from './ui';

const fontAsset = require('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
const maxCoverBytes = 5 * 1024 * 1024;

async function fontData(): Promise<Uint8Array> {
  const asset = Asset.fromModule(fontAsset);
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('Unable to load the PDF font.');
    return new Uint8Array(await response.arrayBuffer());
  }
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Unable to load the PDF font.');
  return new File(asset.localUri).bytes();
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Cover lookup timed out.')), milliseconds);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadCovers(schedule: ScheduleExport): Promise<{ covers: Map<string, Uint8Array>; missing: number }> {
  const titles = new Map(schedule.meetings.filter((row) => row.assignmentId)
    .map((row) => [row.titleId || `missing:${row.kitId}`, row] as const));
  const entries = [...titles];
  const covers = new Map<string, Uint8Array>();
  let missing = 0;
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const [id, row] = entries[next++];
      try {
        const url = row.coverUrl || (row.isbn ? await withTimeout(fetchIsbnCover(row.isbn), 8000) : null);
        if (!url || !/^https:\/\//i.test(url)) throw new Error('No usable cover URL.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Cover download failed.');
          const length = Number(response.headers.get('content-length'));
          if (length > maxCoverBytes) throw new Error('Cover is too large.');
          const bytes = new Uint8Array(await response.arrayBuffer());
          const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
          const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
          if (bytes.length > maxCoverBytes || (!jpeg && !png)) throw new Error('Unsupported cover image.');
          covers.set(id, bytes);
        } finally {
          clearTimeout(timer);
        }
      } catch {
        missing += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => worker()));
  return { covers, missing };
}

async function deliver(content: string | Uint8Array, filename: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const file = new File(Paths.cache, `${Date.now()}-${filename}`);
  await file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType, dialogTitle: 'Save schedule', UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
}

export function ScheduleExportActions({ schedule, disabled, staffClubCount }: { schedule: ScheduleExport; disabled: boolean; staffClubCount?: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function exportFile(format: 'csv' | 'pdf') {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      let content: string | Uint8Array;
      let missing = 0;
      if (format === 'csv') {
        content = scheduleCsv(schedule);
      } else {
        const [font, result] = await Promise.all([fontData(), loadCovers(schedule)]);
        missing = result.missing;
        const pdf = await makeSchedulePdf(schedule, font, result.covers, date);
        missing += pdf.invalidCovers;
        content = pdf.bytes;
      }
      await deliver(content, `book-club-schedule-${date}.${format}`, format === 'csv' ? 'text/csv' : 'application/pdf');
      setMessage(missing ? `Export prepared. ${missing} ${missing === 1 ? 'title has' : 'titles have'} no usable cover; placeholders were included.` : 'Export prepared.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to export the schedule.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ gap: 8 }}>
    <Label>Export schedule</Label>
    <Note>Exports include all meetings for the clubs shown, including unassigned meetings. {schedule.label}.</Note>
    {staffClubCount !== undefined && <Note>{staffClubCount} {staffClubCount === 1 ? 'club is' : 'clubs are'} selected in Clubs shown. Title highlighting does not change the export selection.</Note>}
    <Actions>
      <Action title={busy ? 'Preparing export…' : 'Export CSV'} disabled={disabled || busy || !schedule.meetings.length} onPress={() => { void exportFile('csv'); }} />
      <Action title={busy ? 'Preparing export…' : 'Export PDF'} disabled={disabled || busy || !schedule.meetings.length} onPress={() => { void exportFile('pdf'); }} />
    </Actions>
    {!schedule.meetings.length && <Note>No meetings are available to export for the clubs shown.</Note>}
    {message ? <Text>{message}</Text> : null}
    {error ? <Text style={{ color: '#a22525' }}>Unable to export schedule: {error}</Text> : null}
  </View>;
}
