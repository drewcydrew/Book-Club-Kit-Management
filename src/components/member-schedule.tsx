import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note, narrowWidth } from './ui';
import { MemberOverview } from './member-overview';
import { OverviewExport } from './overview-export';
import { TitleCover } from './title-cover';
import { TitleDetails } from './title-details';
import type { MemberScheduleMeeting } from '../domain/cycle-overview';
import { calendarDateLabel, calendarMonthLabel, isPastMemberMeeting, memberCalendarMonths, memberOverviewMonths } from '../domain/member-calendar';
import type { Assignment, KitLabel, Title } from '../domain/model';

export type MemberView = 'overview' | 'meetings' | 'books';

type Props = {
  view: MemberView;
  onViewChange: (view: MemberView) => void;
  meetings: MemberScheduleMeeting[];
  today: string;
  emptyMessage: string;
  labels: KitLabel[];
  titleFor: (assignment: Assignment) => Title | undefined;
  titleIdFor: (assignment: Assignment) => string | undefined;
  clubNameFor: (clubId: string) => string;
  exportClub?: { name: string; details: string };
};

function meetingDate(meeting: MemberScheduleMeeting): string {
  return meeting.date ?? `${meeting.month} (date not set)`;
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function CalendarDay({ date, count, selected, today, compact, onPress }: {
  date: string; count: number; selected: boolean; today: boolean; compact: boolean; onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const content = <>
    <Text style={{ fontWeight: count || today ? '700' : '400', color: '#183a36' }}>{Number(date.slice(8))}</Text>
    {count > 0 && <Text style={{ color: '#245e51', fontWeight: '700', fontSize: 11 }}>{count > 1 ? count : '•'}</Text>}
  </>;
  const style = {
    flex: 1, minHeight: compact ? 30 : 48, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: focused || selected || today ? 2 : 1,
    borderColor: focused || selected ? '#245e51' : today ? '#75958a' : '#e1e8e3',
    backgroundColor: selected ? '#cce4d4' : count ? '#e4f2e7' : '#fffefa',
  };
  return count ? <Pressable accessibilityRole="button"
    accessibilityLabel={`${calendarDateLabel(date)}, ${count} ${count === 1 ? 'meeting' : 'meetings'}${today ? ', today' : ''}`}
    accessibilityState={{ expanded: selected }} aria-expanded={selected} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onPress={onPress} style={style}>{content}</Pressable>
    : <View accessible accessibilityLabel={`${calendarDateLabel(date)}, no meetings${today ? ', today' : ''}`} style={style}>{content}</View>;
}

function MeetingDetails({ meeting, clubName }: { meeting: MemberScheduleMeeting; clubName: string }) {
  const assignment = meeting.assignment;
  return <View style={{ gap: 6, padding: 12, backgroundColor: '#f3f4f6' }}>
    <Text style={{ fontWeight: '600' }}>{clubName} · {meeting.cycle.name} · {meeting.cycle.status}</Text>
    {assignment ? <>
      <Note>Book details are unavailable. Refresh or contact staff.</Note>
      <Text>Scheduled ready for pickup/delivery: {assignment.ready}</Text>
      <Text>Meeting: {assignment.meeting}</Text>
      <Text>Return due: {assignment.due}</Text>
    </> : <>
      <Text>Meeting: {meetingDate(meeting)}</Text>
      <Note>No book or loan dates have been assigned yet.</Note>
    </>}
  </View>;
}

function ScheduledMeetings({ meetings, clubNameFor }: { meetings: MemberScheduleMeeting[]; clubNameFor: (clubId: string) => string }) {
  return <View style={{ gap: 8, marginTop: 16 }}>
    <Label>Schedule</Label>
    {meetings.map((meeting) => meeting.assignment && <View key={meeting.key} style={{ padding: 12, backgroundColor: '#f3f4f6', gap: 4 }}>
      <Text style={{ fontWeight: '600' }}>{clubNameFor(meeting.clubId)} · {meeting.cycle.name} · {meeting.cycle.status}</Text>
      <Text>Scheduled ready for pickup/delivery: {meeting.assignment.ready}</Text>
      <Text>Meeting: {meeting.assignment.meeting}</Text>
      <Text>Return due: {meeting.assignment.due}</Text>
    </View>)}
  </View>;
}

export function MemberSchedule({ view, onViewChange, meetings, today, emptyMessage, labels, titleFor, titleIdFor, clubNameFor, exportClub }: Props) {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedUndatedMonth, setSelectedUndatedMonth] = useState<string | null>(null);
  const [calendarWidth, setCalendarWidth] = useState(0);
  const [detail, setDetail] = useState<{ kind: 'meeting' | 'book'; key: string } | null>(null);
  const books = new Map<string, { title: Title | undefined; meetings: MemberScheduleMeeting[] }>();
  for (const meeting of meetings) {
    if (!meeting.assignment) continue;
    const titleId = titleIdFor(meeting.assignment);
    const key = titleId ? `title:${titleId}` : `missing-kit:${meeting.assignment.kitId}`;
    const book = books.get(key) ?? { title: titleFor(meeting.assignment), meetings: [] };
    book.meetings.push(meeting);
    books.set(key, book);
  }
  const bookList = [...books.entries()].sort((a, b) =>
    (a[1].title?.name ?? 'Unavailable title').localeCompare(b[1].title?.name ?? 'Unavailable title') || a[0].localeCompare(b[0]));
  const detailMeeting = detail?.kind === 'meeting' ? meetings.find((meeting) => meeting.key === detail.key) : undefined;
  const detailBook = detail?.kind === 'book' ? books.get(detail.key) : undefined;
  const detailTitle = detailMeeting?.assignment ? titleFor(detailMeeting.assignment) : detailBook?.title;
  const detailMeetings = detailMeeting ? [detailMeeting] : detailBook?.meetings ?? [];
  const allMonths = useMemo(() => memberCalendarMonths(meetings, today, true), [meetings, today]);
  const calendarMonths = useMemo(() => showPast ? allMonths : memberCalendarMonths(meetings, today, false), [allMonths, meetings, today, showPast]);
  const overviewMonths = useMemo(() => memberOverviewMonths(meetings, today, showPast), [meetings, today, showPast]);
  const pastCount = meetings.filter((meeting) => isPastMemberMeeting(meeting, today)).length;
  const hasPast = pastCount > 0 || allMonths.some(({ month }) => month < today.slice(0, 7));
  const columns = Platform.OS === 'web' && calendarWidth >= 800 ? 4
    : Platform.OS === 'web' && calendarWidth >= narrowWidth ? 2 : 1;
  const compact = columns > 1;
  const monthWidth = calendarWidth ? (calendarWidth - (columns - 1) * 12) / columns : '100%';

  function renderMeeting(meeting: MemberScheduleMeeting) {
    const title = meeting.assignment ? titleFor(meeting.assignment) : undefined;
    const clubName = clubNameFor(meeting.clubId);
    const expanded = selectedMeeting === meeting.key;
    return <View key={meeting.key} style={{ gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={meeting.assignment && title ? undefined : { expanded }}
        aria-expanded={meeting.assignment && title ? undefined : expanded}
        accessibilityLabel={`${meetingDate(meeting)}, ${clubName}, ${meeting.assignment ? title?.name ?? 'Unavailable title' : 'No book assigned'}, ${meeting.cycle.name}, ${meeting.cycle.status}`}
        onPress={() => meeting.assignment && title ? setDetail({ kind: 'meeting', key: meeting.key }) : setSelectedMeeting(expanded ? null : meeting.key)}
        style={{ minHeight: 44, padding: 10, borderWidth: 1, borderColor: expanded ? '#183a36' : '#d6ddd9', flexDirection: 'row', gap: 10 }}>
        {meeting.assignment && (title && (title.coverUrl || title.isbn.trim())
          ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ marginRight: 0 }} />
          : <View style={{ width: 48, height: 72, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>No cover</Text>
          </View>)}
        <View style={{ flex: 1, justifyContent: 'center', gap: 3 }}>
          <Text style={{ fontWeight: '700', color: '#183a36' }}>{meetingDate(meeting)} · {clubName}</Text>
          <Text>{meeting.assignment ? title?.name ?? 'Unavailable title' : 'No book assigned'}</Text>
          <Text>{meeting.cycle.name} · {meeting.cycle.status}{isPastMemberMeeting(meeting, today) ? ' · Past' : ''}</Text>
        </View>
      </Pressable>
      {expanded && !title && <MeetingDetails meeting={meeting} clubName={clubName} />}
    </View>;
  }

  return <>
    {detailTitle && <TitleDetails title={detailTitle} labels={labels} onClose={() => setDetail(null)}>
      <ScheduledMeetings meetings={detailMeetings} clubNameFor={clubNameFor} />
    </TitleDetails>}
    <Card>
      <Actions>
        <Action selected={view === 'overview'} title="Overview" onPress={() => onViewChange('overview')} />
        <Action selected={view === 'meetings'} title="Meetings" onPress={() => onViewChange('meetings')} />
        <Action selected={view === 'books'} title="Books" onPress={() => onViewChange('books')} />
      </Actions>
    </Card>
    {view === 'overview' && <MemberOverview months={overviewMonths} today={today}
      emptyMessage={emptyMessage} hasPast={hasPast} pastCount={pastCount} showPast={showPast}
      onTogglePast={() => { setShowPast(!showPast); setSelectedDay(null); setSelectedUndatedMonth(null); setSelectedMeeting(null); setDetail(null); }}
      titleFor={titleFor} clubNameFor={clubNameFor}
      onOpenMeeting={(meeting) => setDetail({ kind: 'meeting', key: meeting.key })} />}
    {view === 'overview' && exportClub && <Card>
      <OverviewExport club={exportClub.name} details={exportClub.details} months={overviewMonths} titleFor={titleFor} />
    </Card>}
    {view === 'meetings' && <Card>
      <Label>Meetings</Label>
      {hasPast && <Actions><Action title={showPast ? 'Hide past months and meetings' : `Show past months and meetings (${pastCount})`}
        onPress={() => { setShowPast(!showPast); setSelectedDay(null); setSelectedUndatedMonth(null); setSelectedMeeting(null); setDetail(null); }} /></Actions>}
      {meetings.length === 0 ? <Note>{emptyMessage}</Note>
        : calendarMonths.length === 0 ? <Note>No upcoming meetings. Show past months and meetings to see earlier entries.</Note> : null}
      {calendarMonths.length > 0 && <Note>Select a highlighted day to see its meetings. A number indicates multiple meetings.</Note>}
      <View onLayout={(event) => setCalendarWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        {calendarMonths.map((month) => <View key={month.month} style={{ width: monthWidth, gap: compact ? 2 : 8, marginTop: 8 }}>
          <Label>{calendarMonthLabel(month.month)}</Label>
          <View style={{ flexDirection: 'row' }}>
            {weekdays.map((day) => <View key={day} accessible accessibilityLabel={day} style={{ flex: 1, alignItems: 'center', paddingVertical: compact ? 2 : 6 }}>
              <Text style={{ color: '#465c56', fontSize: 12, fontWeight: '600' }}>{day.slice(0, 1)}</Text>
            </View>)}
          </View>
          {month.weeks.map((week, index) => <View key={index} style={{ flexDirection: 'row' }}>
            {week.map((date, dayIndex) => date
              ? <CalendarDay key={date} date={date} count={month.dated.get(date)?.length ?? 0}
                selected={selectedDay === date} today={today === date} compact={compact}
                onPress={() => { setSelectedDay(selectedDay === date ? null : date); setSelectedMeeting(null); }} />
              : <View key={`empty:${dayIndex}`} style={{ flex: 1, minHeight: compact ? 30 : 48 }} />)}
          </View>)}
          {selectedDay && month.dated.has(selectedDay) && <View style={{ gap: 8, marginTop: 4 }}>
            <Label>{calendarDateLabel(selectedDay)}</Label>
            {month.dated.get(selectedDay)?.map(renderMeeting)}
          </View>}
          {month.undated.length > 0 && <View style={{ gap: 8, marginTop: 4 }}>
            {compact ? <Pressable accessibilityRole="button"
              accessibilityLabel={`${calendarMonthLabel(month.month)}, ${month.undated.length} ${month.undated.length === 1 ? 'meeting' : 'meetings'}, date not set`}
              accessibilityState={{ expanded: selectedUndatedMonth === month.month }} aria-expanded={selectedUndatedMonth === month.month}
              onPress={() => { setSelectedUndatedMonth(selectedUndatedMonth === month.month ? null : month.month); setSelectedMeeting(null); }}
              style={{ minHeight: 30, justifyContent: 'center' }}>
              <Text style={{ color: '#245e51', fontWeight: '600' }}>Date not set ({month.undated.length})</Text>
            </Pressable> : <Label>Date not set</Label>}
            {(!compact || selectedUndatedMonth === month.month) && month.undated.map(renderMeeting)}
          </View>}
        </View>)}
      </View>
    </Card>}
    {view === 'books' && <Card>
      <Label>Books</Label>
      {bookList.length === 0 && <Note>{meetings.length === 0 ? emptyMessage : 'No books have been assigned to these meetings yet.'}</Note>}
      {bookList.map(([key, book]) => {
        const expanded = selectedBook === key;
        const title = book.title;
        return <View key={key} style={{ gap: 6 }}>
          <Pressable accessibilityRole="button" accessibilityState={title ? undefined : { expanded }}
            accessibilityLabel={`${title?.name ?? 'Unavailable title'}, ${title?.author || 'author unavailable'}, ${book.meetings.length} ${book.meetings.length === 1 ? 'meeting' : 'meetings'}`}
            onPress={() => title ? setDetail({ kind: 'book', key }) : setSelectedBook(expanded ? null : key)}
            style={{ flexDirection: 'row', gap: 12, padding: 10, minHeight: 44, borderWidth: 1, borderColor: expanded ? '#183a36' : '#d6ddd9' }}>
            {title && (title.coverUrl || title.isbn)
              ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 64, height: 96, marginRight: 0, marginBottom: 0 }} />
              : <View style={{ width: 64, height: 96, backgroundColor: '#e5e7eb', justifyContent: 'center', padding: 4 }}>
                <Text numberOfLines={4} style={{ textAlign: 'center', fontSize: 11 }}>{title?.name ?? 'Unavailable title'}</Text>
              </View>}
            <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
              <Text style={{ fontWeight: '700', color: '#183a36' }}>{title?.name ?? 'Unavailable title'}</Text>
              <Text>{title?.author || 'Author unavailable'}</Text>
              <Text>{book.meetings.length} {book.meetings.length === 1 ? 'meeting' : 'meetings'}</Text>
            </View>
          </Pressable>
          {expanded && !title && <View style={{ gap: 8 }}>
            <Note>Book details are unavailable. Refresh or contact staff.</Note>
            <ScheduledMeetings meetings={book.meetings} clubNameFor={clubNameFor} />
          </View>}
        </View>;
      })}
    </Card>}
  </>;
}
