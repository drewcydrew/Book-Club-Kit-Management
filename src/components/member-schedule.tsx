import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note } from './ui';
import { TitleCover } from './title-cover';
import { TitleDetails } from './title-details';
import type { MemberScheduleMeeting } from '../domain/cycle-overview';
import type { Assignment, KitLabel, Title } from '../domain/model';

export type MemberView = 'meetings' | 'books';

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
};

function meetingDate(meeting: MemberScheduleMeeting): string {
  return meeting.date ?? `${meeting.month} (date not set)`;
}

function isPast(meeting: MemberScheduleMeeting, today: string): boolean {
  return meeting.date ? meeting.date < today : meeting.month < today.slice(0, 7);
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

export function MemberSchedule({ view, onViewChange, meetings, today, emptyMessage, labels, titleFor, titleIdFor, clubNameFor }: Props) {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
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
  const visibleMeetings = showPast ? meetings : meetings.filter((meeting) => !isPast(meeting, today));
  const pastCount = meetings.length - meetings.filter((meeting) => !isPast(meeting, today)).length;
  const years = [...new Set(visibleMeetings.map((meeting) => meeting.month.slice(0, 4)))];

  return <>
    {detailTitle && <TitleDetails title={detailTitle} labels={labels} onClose={() => setDetail(null)}>
      <ScheduledMeetings meetings={detailMeetings} clubNameFor={clubNameFor} />
    </TitleDetails>}
    <Card>
      <Actions>
        <Action selected={view === 'meetings'} title="Meetings" onPress={() => onViewChange('meetings')} />
        <Action selected={view === 'books'} title="Books" onPress={() => onViewChange('books')} />
      </Actions>
    </Card>
    {view === 'meetings' && <Card>
      <Label>Meetings</Label>
      {pastCount > 0 && <Actions><Action title={showPast ? 'Hide past meetings' : `Show past meetings (${pastCount})`}
        onPress={() => { setShowPast(!showPast); setSelectedMeeting(null); }} /></Actions>}
      {meetings.length === 0 ? <Note>{emptyMessage}</Note>
        : visibleMeetings.length === 0 ? <Note>No upcoming meetings. Show past meetings to see earlier entries.</Note> : null}
      {years.map((year) => <View key={year} style={{ gap: 8 }}>
        <Label>{year}</Label>
        {visibleMeetings.filter((meeting) => meeting.month.startsWith(year)).map((meeting) => {
          const title = meeting.assignment ? titleFor(meeting.assignment) : undefined;
          const clubName = clubNameFor(meeting.clubId);
          const expanded = selectedMeeting === meeting.key;
          return <View key={meeting.key} style={{ gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityState={meeting.assignment && title ? undefined : { expanded }}
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
                <Text>{meeting.cycle.name} · {meeting.cycle.status}{isPast(meeting, today) ? ' · Past' : ''}</Text>
              </View>
            </Pressable>
            {expanded && !title && <MeetingDetails meeting={meeting} clubName={clubName} />}
          </View>;
        })}
      </View>)}
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
