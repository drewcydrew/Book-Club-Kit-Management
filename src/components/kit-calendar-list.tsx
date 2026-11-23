import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Label, Note } from './ui';
import { TitleCover } from './title-cover';
import { calendarDateLabel, calendarMonthLabel } from '../domain/member-calendar';
import type { KitCalendar, KitDayMark } from '../domain/kit-calendar';

export type KitCalendarEntry = {
  kitId: string;
  title: string;
  barcode: string;
  coverUrl?: string | null;
  isbn: string;
  calendar: KitCalendar;
};

type Props = {
  entries: KitCalendarEntry[];
  clubNameFor: (clubId: string) => string;
  today: string;
  wide?: boolean;
};

const palette = ['#245e51', '#2f6fa3', '#7c4dbd', '#a35d2f', '#3f7f3a', '#8a3b5c'];
const overrunColour = '#d97706';
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const maxBars = 3;

function markRole(mark: KitDayMark): string {
  const parts = [mark.ready && 'Pickup', mark.meeting && 'Meeting', mark.due && 'Return due'].filter(Boolean);
  const role = parts.length ? parts.join(' · ') : 'Out';
  return mark.overrun ? `${role} · Over loan period` : role;
}

export function KitCalendarList({ entries, clubNameFor, today, wide = false }: Props) {
  return <View style={{ gap: 12 }}>
    <Note>Select a kit to show its calendar. Coloured bars show when it is out, from pickup to return. Amber bars are loans longer than the loan period plus turnaround buffer.</Note>
    {entries.length === 0 && <Note>No kits are assigned to the selected clubs in this cycle.</Note>}
    {entries.map((entry, index) => <KitEntry key={entry.kitId} entry={entry} colour={palette[index % palette.length]}
      clubNameFor={clubNameFor} today={today} wide={wide} />)}
  </View>;
}

function KitEntry({ entry, colour, clubNameFor, today, wide }: { entry: KitCalendarEntry; colour: string; wide: boolean } & Pick<Props, 'clubNameFor' | 'today'>) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { calendar } = entry;
  const summary = calendar.kits[0];
  const dayMarks = selectedDay ? calendar.marks.get(selectedDay) ?? [] : [];

  return <View style={{ borderBottomWidth: 1, borderBottomColor: '#d6ddd9', paddingBottom: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.title}, ${entry.barcode}`}
      accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 44 }}>
      <TitleCover coverUrl={entry.coverUrl} isbn={entry.isbn} style={{ width: 48, height: 72, marginRight: 0 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700', color: '#183a36' }}>{entry.title}</Text>
        <Text style={{ color: '#465c56' }}>{entry.barcode} · {summary?.assignments.length ?? 0} {summary?.assignments.length === 1 ? 'loan' : 'loans'}</Text>
      </View>
      <Text style={{ color: '#245e51', fontSize: 16 }}>{expanded ? '▾' : '▸'}</Text>
    </Pressable>
    {expanded && <View style={{ gap: 12, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {calendar.months.map((month) => <View key={month.month} style={{ gap: 2, width: wide ? '23%' : '100%' }}>
        <Label>{calendarMonthLabel(month.month)}</Label>
        <View style={{ flexDirection: 'row' }}>
          {weekdays.map((day, index) => <View key={index} accessible accessibilityLabel={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
            <Text style={{ color: '#465c56', fontSize: 12, fontWeight: '600' }}>{day}</Text>
          </View>)}
        </View>
        {month.weeks.map((week, weekIndex) => <View key={weekIndex} style={{ flexDirection: 'row' }}>
          {week.map((date, dayIndex) => {
            if (!date) return <View key={`empty:${dayIndex}`} style={{ flex: 1, minHeight: 26 }} />;
            const marks = calendar.marks.get(date) ?? [];
            const selected = selectedDay === date;
            const label = `${calendarDateLabel(date)}, ${marks.length ? 'out' : 'not out'}${date === today ? ', today' : ''}`;
            return <Pressable key={date} accessibilityRole="button" accessibilityLabel={label}
              accessibilityState={{ selected }} onPress={() => setSelectedDay(selected ? null : date)}
              style={{ flex: 1, minHeight: 26, paddingHorizontal: 2, paddingVertical: 1, gap: 1, borderWidth: selected || date === today ? 2 : 1,
                borderColor: selected ? '#245e51' : date === today ? '#75958a' : '#e1e8e3', backgroundColor: selected ? '#cce4d4' : '#fffefa' }}>
              <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: marks.length || date === today ? '700' : '400', color: '#183a36' }}>{Number(date.slice(8))}</Text>
              {marks.slice(0, maxBars).map((mark) => <View key={`${mark.assignment.id}:${mark.ready ? 'r' : mark.due ? 'd' : 'm'}`}
                style={{ height: 3, backgroundColor: mark.overrun ? overrunColour : colour }} />)}
              {marks.length > maxBars && <Text style={{ fontSize: 8, lineHeight: 10, color: '#465c56' }}>+{marks.length - maxBars}</Text>}
            </Pressable>;
          })}
        </View>)}
      </View>)}
      </View>
      {selectedDay && <View style={{ gap: 6, padding: 12, backgroundColor: '#f3f4f6' }}>
        <Label>{calendarDateLabel(selectedDay)}</Label>
        {dayMarks.length === 0 && <Note>This kit is not out on this day.</Note>}
        {dayMarks.map((mark) => <Text key={`${mark.assignment.id}:${markRole(mark)}`}>
          {clubNameFor(mark.assignment.clubId)} · {markRole(mark)}
        </Text>)}
      </View>}
      {summary && <View style={{ gap: 4 }}>
        {summary.assignments.map((assignment) => <Text key={assignment.id}>
          Out {calendarDateLabel(assignment.ready)} to {calendarDateLabel(assignment.due)} · meeting {calendarDateLabel(assignment.meeting)} · {clubNameFor(assignment.clubId)}
          {summary.overruns.has(assignment.id) ? ' · over loan period' : ''}
        </Text>)}
        {summary.gaps.map((gap) => <Text key={`${gap.from}:${gap.to}`} style={{ color: '#465c56' }}>
          Not out {calendarDateLabel(gap.from)} to {calendarDateLabel(gap.to)} ({gap.days} {gap.days === 1 ? 'day' : 'days'})
        </Text>)}
        {summary.overlap && <Note>Two loans for this kit overlap. Check the schedule.</Note>}
      </View>}
    </View>}
  </View>;
}
