import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type HostInstance } from 'react-native';
import { Action, Actions, Card, Label, Note, narrowWidth } from './ui';
import { radius } from './design';
import { TitleCover } from './title-cover';
import type { MemberScheduleMeeting } from '../domain/cycle-overview';
import { calendarDateLabel, calendarMonthLabel, type MemberOverviewMonth, type OverviewMarker, type OverviewMarkerKind } from '../domain/member-calendar';
import type { Assignment, Title } from '../domain/model';

const markerColors: Record<OverviewMarkerKind, string> = { ready: '#b45309', meeting: '#245e51', due: '#9a3412' };
const markerLabels: Record<OverviewMarkerKind, string> = { ready: 'Checkout', meeting: 'Meeting', due: 'Return' };
const weekdayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const previewWidth = 240;

type HoverTarget = { cell: HostInstance; date: string; markers: OverviewMarker[] };

type Props = {
  months: MemberOverviewMonth[];
  today: string;
  emptyMessage: string;
  hasPast: boolean;
  pastCount: number;
  showPast: boolean;
  onTogglePast: () => void;
  titleFor: (assignment: Assignment) => Title | undefined;
  clubNameFor: (clubId: string) => string;
  onOpenMeeting: (meeting: MemberScheduleMeeting) => void;
};

function MarkerLegend() {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
    {(Object.keys(markerLabels) as OverviewMarkerKind[]).map((kind) => <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: markerColors[kind] }} />
      <Text style={{ fontSize: 12, color: '#465c56' }}>{markerLabels[kind]}</Text>
    </View>)}
  </View>;
}

function DayCell({ date, markers, isToday, onOpen, onHover }: {
  date: string; markers?: OverviewMarker[]; isToday: boolean; onOpen: (date: string) => void; onHover: (target: HoverTarget | null) => void;
}) {
  const isWeb = Platform.OS === 'web';
  const cellRef = useRef<HostInstance>(null);
  const names = markers?.map((marker) => markerLabels[marker.kind]).join(', ');
  const accessibilityLabel = `${calendarDateLabel(date)}${isToday ? ', today' : ''}${names ? `, ${names}` : ''}`;
  const content = <>
    <Text style={{ fontSize: 15, fontWeight: markers || isToday ? '700' : '400', color: '#183a36' }}>{Number(date.slice(8))}</Text>
    {markers && <View style={{ flexDirection: 'row', gap: 3 }}>
      {markers.map((marker) => <View key={`${marker.kind}:${marker.meeting.key}`} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: markerColors[marker.kind] }} />)}
    </View>}
  </>;
  const style = {
    flex: 1, height: 50, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: isToday ? 2 : 1, borderColor: isToday ? '#75958a' : '#e1e8e3',
    backgroundColor: markers ? '#f1f7f3' : '#fffefa',
  };
  return markers
    ? <Pressable ref={cellRef} accessibilityRole="button" accessibilityHint={isWeb ? undefined : 'Shows the checkout, meeting and return details for this day'}
      accessibilityLabel={accessibilityLabel} onPress={isWeb ? undefined : () => onOpen(date)}
      onHoverIn={() => { if (cellRef.current) onHover({ cell: cellRef.current, date, markers: markers ?? [] }); }}
      onHoverOut={() => onHover(null)} style={style}>{content}</Pressable>
    : <View accessible accessibilityLabel={accessibilityLabel} style={style}>{content}</View>;
}

function MiniCalendar({ entry, today, narrow, onOpen, onHover }: {
  entry: MemberOverviewMonth; today: string; narrow: boolean; onOpen: (date: string) => void; onHover: (target: HoverTarget | null) => void;
}) {
  return <View accessible accessibilityLabel={`${calendarMonthLabel(entry.month)} calendar`} style={{ width: narrow ? '100%' : 300, maxWidth: 420, gap: 4 }}>
    <View style={{ flexDirection: 'row' }}>
      {weekdayLetters.map((letter, index) => <Text key={index} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#465c56', fontWeight: '600' }}>{letter}</Text>)}
    </View>
    {entry.weeks.map((week, weekIndex) => <View key={weekIndex} style={{ flexDirection: 'row' }}>
      {week.map((date, dayIndex) => date
        ? <DayCell key={date} date={date} markers={entry.markers.get(date)} isToday={today === date} onOpen={onOpen} onHover={onHover} />
        : <View key={`empty:${dayIndex}`} style={{ flex: 1, height: 50 }} />)}
    </View>)}
  </View>;
}

type DayDetailProps = {
  date: string; markers: OverviewMarker[];
  titleFor: Props['titleFor']; clubNameFor: Props['clubNameFor'];
};

function DayDetailLines({ date, markers, titleFor, clubNameFor }: DayDetailProps) {
  return <>
    <Text style={{ fontWeight: '700', fontSize: 14, color: '#183a36' }}>{calendarDateLabel(date)}</Text>
    {markers.map((marker) => {
      const name = marker.meeting.assignment ? titleFor(marker.meeting.assignment)?.name : undefined;
      return <Text key={`${marker.kind}:${marker.meeting.key}`} style={{ fontSize: 13, color: '#334e47' }}>
        {markerLabels[marker.kind]}: {name ?? 'Unavailable title'} · {clubNameFor(marker.meeting.clubId)}
      </Text>;
    })}
  </>;
}

function DayPreview({ left, top, width, ...details }: DayDetailProps & { left: number; top: number; width: number }) {
  return <View pointerEvents="none" style={[styles.preview, { left, top, width }]}>
    <DayDetailLines {...details} />
  </View>;
}

function DayPopup({ onOpen, onClose, clubNameFor, ...details }: DayDetailProps & {
  onOpen: (meeting: MemberScheduleMeeting) => void; onClose: () => void;
}) {
  const { date, markers } = details;
  const meetings = [...new Map(markers.map((marker) => [marker.meeting.key, marker.meeting])).values()];
  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close day details" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal accessibilityLabel={`Dates on ${calendarDateLabel(date)}`} style={styles.dialog}>
        <DayDetailLines {...details} clubNameFor={clubNameFor} />
        <Actions>
          {meetings.map((meeting) => <Action key={meeting.key} title={`Open meeting${meetings.length > 1 ? ` · ${clubNameFor(meeting.clubId)}` : ''}`}
            onPress={() => { onClose(); onOpen(meeting); }} />)}
          <Action title="Close" onPress={onClose} />
        </Actions>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  dialog: { width: '100%', maxWidth: 420, gap: 10, padding: 18, borderRadius: radius.media, backgroundColor: '#fffefa' },
  preview: { position: 'absolute', width: previewWidth, zIndex: 10, gap: 6, padding: 10,
    borderWidth: 1, borderColor: '#e1e8e3', borderRadius: radius.media, backgroundColor: '#ffffff', boxShadow: '0 6px 18px rgba(24, 58, 54, 0.18)' },
});

function MonthCard({ entry, today, narrow, titleFor, clubNameFor, onOpenMeeting, onHover }: {
  entry: MemberOverviewMonth; today: string; narrow: boolean;
  titleFor: Props['titleFor']; clubNameFor: Props['clubNameFor']; onOpenMeeting: Props['onOpenMeeting'];
  onHover: (target: HoverTarget | null) => void;
}) {
  const coverWidth = narrow ? 72 : 96;
  const coverHeight = narrow ? 108 : 144;
  const book = entry.book;
  const assignment = book?.assignment;
  const title = assignment ? titleFor(assignment) : undefined;
  const others = entry.meetings.flatMap((meeting) => meeting !== book && meeting.assignment ? [{ meeting, assignment: meeting.assignment }] : []);
  const unbooked = entry.meetings.filter((meeting) => !meeting.assignment && meeting.date);
  const undatedCount = entry.meetings.filter((meeting) => !meeting.date).length;
  const [active, setActive] = useState<string | null>(null);
  return <Card soft>
    <Label>{calendarMonthLabel(entry.month)}{entry.month < today.slice(0, 7) ? ' · Past' : ''}</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      <View style={{ flexGrow: 1, flexBasis: 220, gap: 10 }}>
        {book && assignment ? <Pressable accessibilityRole="button" disabled={!title}
          accessibilityLabel={`${title?.name ?? 'Unavailable title'}, ${clubNameFor(book.clubId)}, ${calendarMonthLabel(entry.month)}`}
          onPress={() => onOpenMeeting(book)} style={{ flexDirection: 'row', gap: 12 }}>
          {title && (title.coverUrl || title.isbn.trim())
            ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: coverWidth, height: coverHeight, marginRight: 0, marginBottom: 0 }} />
            : <View style={{ width: coverWidth, height: coverHeight, backgroundColor: '#e5e7eb', justifyContent: 'center', padding: 6 }}>
              <Text numberOfLines={5} style={{ textAlign: 'center', fontSize: 11 }}>{title?.name ?? 'Unavailable title'}</Text>
            </View>}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: '#183a36' }}>{title?.name ?? 'Unavailable title'}</Text>
            <Text>{title?.author || 'Author unavailable'}</Text>
            <Text style={{ fontSize: 12, color: '#465c56' }}>Checkout {assignment.ready}</Text>
            <Text style={{ fontSize: 12, color: '#465c56' }}>Meeting {assignment.meeting} · {clubNameFor(book.clubId)}</Text>
            <Text style={{ fontSize: 12, color: '#465c56' }}>Return {assignment.due}</Text>
          </View>
        </Pressable> : <Note>{entry.meetings.length ? 'No book chosen yet' : entry.markers.size ? 'No meeting this month. Checkouts and returns are shown in the calendar.' : 'No meeting scheduled this month'}</Note>}
        {others.map(({ meeting, assignment: other }) => <Pressable key={meeting.key} accessibilityRole="button"
          onPress={() => onOpenMeeting(meeting)} style={{ borderTopWidth: 1, borderTopColor: '#e1e8e3', paddingTop: 8 }}>
          <Text style={{ fontSize: 13 }}>Also this month: {titleFor(other)?.name ?? 'Unavailable title'} · {meeting.date}</Text>
        </Pressable>)}
        {unbooked.map((meeting) => <Text key={meeting.key} style={{ fontSize: 13, color: '#465c56' }}>
          Meeting {meeting.date} · {clubNameFor(meeting.clubId)} · no book chosen
        </Text>)}
        {undatedCount > 0 && <Note>{undatedCount} {undatedCount === 1 ? 'meeting' : 'meetings'} without a date</Note>}
      </View>
      <MiniCalendar entry={entry} today={today} narrow={narrow} onOpen={setActive} onHover={onHover} />
    </View>
    {active && <DayPopup date={active} markers={entry.markers.get(active) ?? []} titleFor={titleFor} clubNameFor={clubNameFor}
      onOpen={onOpenMeeting} onClose={() => setActive(null)} />}
  </Card>;
}

export function MemberOverview({ months, today, emptyMessage, hasPast, pastCount, showPast, onTogglePast, titleFor, clubNameFor, onOpenMeeting }: Props) {
  const rootRef = useRef<HostInstance>(null);
  const [rootWidth, setRootWidth] = useState(0);
  const [preview, setPreview] = useState<(HoverTarget & { left: number; top: number; width: number }) | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const narrow = windowWidth < narrowWidth;
  const showPreview = (target: HoverTarget | null) => {
    if (!target) {
      setPreview(null);
      return;
    }
    target.cell.measureInWindow((cellX, cellY, _width, cellHeight) => {
      rootRef.current?.measureInWindow((rootX, rootY) => {
        const width = rootWidth ? Math.min(previewWidth, rootWidth) : previewWidth;
        const left = Math.max(0, Math.min(cellX - rootX, rootWidth - width));
        setPreview({ ...target, left, top: cellY - rootY + cellHeight + 6, width });
      });
    });
  };
  const meetings = months.flatMap((entry) => entry.meetings);
  const dated = meetings.filter((meeting) => meeting.date);
  const first = dated[0];
  const last = dated.at(-1);
  const next = dated.find((meeting) => meeting.date && meeting.date >= today);
  const booked = months.filter((entry) => entry.book).length;
  return <View ref={rootRef} onLayout={(event) => setRootWidth(event.nativeEvent.layout.width)} style={{ gap: 18 }}>
    <Card>
      <Label>Overview</Label>
      <Note>{booked} {booked === 1 ? 'book' : 'books'} across {months.length} {months.length === 1 ? 'month' : 'months'}. Select a highlighted day or a book to see its details.</Note>
      <Text>First meeting: {first?.date ? calendarDateLabel(first.date) : 'Not set'}</Text>
      <Text>Last meeting: {last?.date ? calendarDateLabel(last.date) : 'Not set'}</Text>
      <Text>Next meeting: {next?.date ? `${calendarDateLabel(next.date)} · ${clubNameFor(next.clubId)}` : 'None upcoming'}</Text>
      <MarkerLegend />
      {hasPast && <Actions><Action title={showPast ? 'Hide past months and meetings' : `Show past months and meetings (${pastCount})`} onPress={onTogglePast} /></Actions>}
    </Card>
    {months.length === 0 ? <Card><Note>{meetings.length === 0 ? emptyMessage : 'No upcoming months. Show past months and meetings to see earlier entries.'}</Note></Card>
      : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {months.map((entry) => <View key={entry.month} style={{ flexGrow: 1, flexBasis: narrow ? '100%' : 560, minWidth: narrow ? undefined : 320 }}>
          <MonthCard entry={entry} today={today} narrow={narrow} titleFor={titleFor} clubNameFor={clubNameFor} onOpenMeeting={onOpenMeeting} onHover={showPreview} />
        </View>)}
      </View>}
    {preview && <DayPreview date={preview.date} markers={preview.markers} titleFor={titleFor} clubNameFor={clubNameFor} left={preview.left} top={preview.top} width={preview.width} />}
  </View>;
}
