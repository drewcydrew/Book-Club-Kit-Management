import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note } from './ui';
import { TitleCover } from './title-cover';
import type { MemberMeetingMonth } from '../domain/cycle-overview';
import type { Assignment, Title } from '../domain/model';

export type MemberView = 'meetings' | 'gallery' | 'grid';

const COVER_WIDTH = 104;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_WIDTH = '14.2857%';

type Props = {
  view: MemberView;
  onViewChange: (view: MemberView) => void;
  calendar: MemberMeetingMonth[];
  today: string;
  titleFor: (assignment: Assignment) => Title | undefined;
  clubNameFor: (clubId: string) => string;
  renderDetail: (assignment: Assignment) => React.ReactNode;
  gridContent: React.ReactNode;
};

// Months are YYYY-MM strings; UTC arithmetic avoids local timezone shifts.
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
}

// Monday-first: leading blanks, then every day of the month as YYYY-MM-DD.
function monthCells(month: string): (string | null)[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
}

export function MemberSchedule({ view, onViewChange, calendar, today, titleFor, clubNameFor, renderDetail, gridContent }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const assignments = calendar.flatMap((entry) => entry.days.flatMap((day) => day.assignments));
  const assignmentsByDay = new Map(calendar.flatMap((entry) => entry.days.map((day) => [day.day, day.assignments] as const)));
  const selected = assignments.find((assignment) => assignment.id === selectedId);
  const label = (assignment: Assignment) => `${titleFor(assignment)?.name ?? 'Unavailable title'}, ${clubNameFor(assignment.clubId)}, ${assignment.meeting}`;

  return <>
    <Card>
      <Actions>
        <Action selected={view === 'meetings'} title="Meetings" onPress={() => onViewChange('meetings')} />
        <Action selected={view === 'gallery'} title="Gallery" onPress={() => onViewChange('gallery')} />
        <Action selected={view === 'grid'} title="Grid" onPress={() => onViewChange('grid')} />
      </Actions>
    </Card>
    {view === 'meetings' && <Card>
      <Actions>
        <Action title="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Label>{monthTitle(month)}</Label>
        <Action title="Next month" onPress={() => setMonth(shiftMonth(month, 1))} />
      </Actions>
      {calendar.length === 0 && <Note>No drafted or published meetings for the selected clubs.</Note>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={{ width: CELL_WIDTH, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>{weekday}</Text>)}
        {monthCells(month).map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={{ width: CELL_WIDTH }} />;
          const isToday = day === today;
          return <View key={day} style={{ width: CELL_WIDTH, minHeight: 64, padding: 2, borderWidth: 1, borderColor: isToday ? '#183a36' : '#d6ddd9', backgroundColor: isToday ? '#e6f0ed' : undefined, opacity: day < today ? 0.6 : 1 }}>
            <Text style={{ fontSize: 11, fontWeight: isToday ? '700' : '400' }}>{Number(day.slice(8))}</Text>
            {(assignmentsByDay.get(day) ?? []).map((assignment) => <Pressable key={assignment.id} accessibilityRole="button" accessibilityLabel={label(assignment)}
              accessibilityState={{ selected: selectedId === assignment.id }} onPress={() => setSelectedId(assignment.id)}>
              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '600', color: '#183a36', backgroundColor: selectedId === assignment.id ? '#c9ddd7' : '#eef4f1' }}>
                {titleFor(assignment)?.name ?? 'Unavailable'}
              </Text>
            </Pressable>)}
          </View>;
        })}
      </View>
      {selected && renderDetail(selected)}
    </Card>}
    {view === 'gallery' && <Card>
      <Label>Gallery · {assignments.length} {assignments.length === 1 ? 'meeting' : 'meetings'}</Label>
      {calendar.length === 0 && <Note>No drafted or published meetings for the selected clubs.</Note>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {assignments.map((assignment) => {
          const title = titleFor(assignment);
          const active = selectedId === assignment.id;
          const size = { width: COVER_WIDTH, height: COVER_WIDTH * 1.5 };
          return <Pressable key={assignment.id} accessibilityRole="button" accessibilityLabel={label(assignment)} accessibilityState={{ selected: active }}
            onHoverIn={() => setSelectedId(assignment.id)} onPress={() => setSelectedId(assignment.id)}
            style={{ width: COVER_WIDTH, borderRadius: 6, borderWidth: 2, borderColor: active ? '#183a36' : 'transparent' }}>
            {title && (title.coverUrl || title.isbn)
              ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ ...size, marginRight: 0, marginBottom: 0 }} />
              : <View style={{ ...size, borderRadius: 4, backgroundColor: '#e5e7eb', padding: 6, justifyContent: 'center' }}>
                <Text numberOfLines={4} style={{ fontSize: 12, textAlign: 'center' }}>{title?.name ?? 'Unavailable title'}</Text>
              </View>}
          </Pressable>;
        })}
      </View>
      {selected && renderDetail(selected)}
    </Card>}
    {view === 'grid' && gridContent}
  </>;
}
