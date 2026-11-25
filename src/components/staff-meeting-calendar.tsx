import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note } from './ui';
import { markerColors, markerLabels } from './member-overview';
import { radius } from './design';
import { TitleCover } from './title-cover';
import { calendarDateLabel, calendarMonthLabel, type OverviewMarkerKind } from '../domain/member-calendar';
import { staffCalendarMonths, type StaffCalendarMarker, type StaffCalendarMeeting, type StaffCalendarMonth } from '../domain/staff-calendar';
import type { Assignment, Cycle, Title } from '../domain/model';

const weekdayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = {
  cycle: Cycle;
  assignments: Assignment[];
  clubIds: string[];
  today: string;
  canEdit: boolean;
  titleFor: (assignment: Assignment) => Title | undefined;
  clubNameFor: (clubId: string) => string;
  onEditMeeting: (slotId: string) => void;
};

function meetingTitle(meeting: StaffCalendarMeeting, titleFor: Props['titleFor']): string {
  if (!meeting.assignment) return 'No book chosen';
  return titleFor(meeting.assignment)?.name ?? 'Unavailable title';
}

function DayCell({ date, markers, isToday, onOpen }: {
  date: string; markers?: StaffCalendarMarker[]; isToday: boolean; onOpen: (date: string) => void;
}) {
  const names = markers?.map((marker) => markerLabels[marker.kind]).join(', ');
  const accessibilityLabel = `${calendarDateLabel(date)}${isToday ? ', today' : ''}${names ? `, ${names}` : ''}`;
  const style = {
    flex: 1, height: 50, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: isToday ? 2 : 1, borderColor: isToday ? '#75958a' : '#e1e8e3',
    backgroundColor: markers ? '#f1f7f3' : '#fffefa',
  };
  const content = <>
    <Text style={{ fontSize: 15, fontWeight: markers || isToday ? '700' : '400', color: '#183a36' }}>{Number(date.slice(8))}</Text>
    {markers && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}>
      {markers.map((marker) => <View key={`${marker.kind}:${marker.meeting.slotId}`}
        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: markerColors[marker.kind] }} />)}
    </View>}
  </>;
  return markers
    ? <Pressable accessibilityRole="button" accessibilityHint="Shows the pickup, meeting and return dates for this day"
      accessibilityLabel={accessibilityLabel} onPress={() => onOpen(date)} style={style}>{content}</Pressable>
    : <View accessible accessibilityLabel={accessibilityLabel} style={style}>{content}</View>;
}

function DayDialog({ date, markers, titleFor, clubNameFor, canEdit, onEdit, onClose }: {
  date: string; markers: StaffCalendarMarker[]; canEdit: boolean;
  titleFor: Props['titleFor']; clubNameFor: Props['clubNameFor']; onEdit: (slotId: string) => void; onClose: () => void;
}) {
  const meetings = [...new Map(markers.map((marker) => [marker.meeting.slotId, marker.meeting])).values()];
  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close day details" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal accessibilityLabel={`Meetings on ${calendarDateLabel(date)}`} style={styles.dialog}>
        <Text style={{ fontWeight: '700', fontSize: 14, color: '#183a36' }}>{calendarDateLabel(date)}</Text>
        {meetings.map((meeting) => {
          const title = meeting.assignment ? titleFor(meeting.assignment) : undefined;
          return <View key={meeting.slotId} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {title && (title.coverUrl || title.isbn.trim())
              ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 56, height: 84, marginRight: 0 }} />
              : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#183a36' }}>{clubNameFor(meeting.clubId)} · {meetingTitle(meeting, titleFor)}</Text>
              {markers.filter((marker) => marker.meeting.slotId === meeting.slotId).map((marker) => <Text key={marker.kind} style={{ fontSize: 13, color: '#334e47' }}>
                {markerLabels[marker.kind]}
              </Text>)}
            </View>
          </View>;
        })}
        {!canEdit && <Note>Meetings can be edited while the cycle is collecting or drafted.</Note>}
        <Actions>
          {canEdit && meetings.map((meeting) => <Action key={meeting.slotId} title={`Edit meeting · ${clubNameFor(meeting.clubId)}`}
            accessibilityLabel={`Edit meeting for ${clubNameFor(meeting.clubId)} on ${calendarDateLabel(date)}`}
            onPress={() => { onClose(); onEdit(meeting.slotId); }} />)}
          <Action title="Close" onPress={onClose} />
        </Actions>
      </View>
    </View>
  </Modal>;
}

function MonthCard({ entry, today, canEdit, titleFor, clubNameFor, onEdit }: {
  entry: StaffCalendarMonth; today: string; canEdit: boolean;
  titleFor: Props['titleFor']; clubNameFor: Props['clubNameFor']; onEdit: Props['onEditMeeting'];
}) {
  const [active, setActive] = useState<string | null>(null);
  return <Card soft>
    <Label>{calendarMonthLabel(entry.month)}{entry.month < today.slice(0, 7) ? ' · Past' : ''}</Label>
    <View accessible accessibilityLabel={`${calendarMonthLabel(entry.month)} calendar`} style={{ width: '100%', maxWidth: 420, gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {weekdayLetters.map((letter, index) => <Text key={index} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#465c56', fontWeight: '600' }}>{letter}</Text>)}
      </View>
      {entry.weeks.map((week, weekIndex) => <View key={weekIndex} style={{ flexDirection: 'row' }}>
        {week.map((date, dayIndex) => date
          ? <DayCell key={date} date={date} markers={entry.markers.get(date)} isToday={today === date} onOpen={setActive} />
          : <View key={`empty:${dayIndex}`} style={{ flex: 1, height: 50 }} />)}
      </View>)}
    </View>
    {active && <DayDialog date={active} markers={entry.markers.get(active) ?? []} canEdit={canEdit}
      titleFor={titleFor} clubNameFor={clubNameFor} onEdit={onEdit} onClose={() => setActive(null)} />}
  </Card>;
}

export function StaffMeetingCalendar({ cycle, assignments, clubIds, today, canEdit, titleFor, clubNameFor, onEditMeeting }: Props) {
  const [shownKinds, setShownKinds] = useState<OverviewMarkerKind[]>(['meeting', 'ready', 'due']);
  const months = staffCalendarMonths(cycle, assignments, clubIds, shownKinds);
  const undated = months.flatMap((entry) => entry.undated);
  if (clubIds.length === 0) return null;
  const toggleKind = (kind: OverviewMarkerKind) => setShownKinds((current) => current.includes(kind)
    ? current.filter((item) => item !== kind)
    : [...current, kind]);
  return <View style={{ gap: 14 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {(Object.keys(markerLabels) as OverviewMarkerKind[]).map((kind) => {
        const checked = shownKinds.includes(kind);
        return <Pressable key={kind} accessibilityRole="checkbox" accessibilityState={{ checked }}
          accessibilityLabel={`Show ${markerLabels[kind].toLowerCase()} dates`} onPress={() => toggleKind(kind)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: checked ? 1 : 0.45 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: markerColors[kind] }} />
          <Text style={{ fontSize: 12, color: '#465c56', textDecorationLine: checked ? 'none' : 'line-through' }}>{markerLabels[kind]}</Text>
        </Pressable>;
      })}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {months.map((entry) => <View key={entry.month} style={{ flexGrow: 1, flexBasis: 320 }}>
        <MonthCard entry={entry} today={today} canEdit={canEdit} titleFor={titleFor} clubNameFor={clubNameFor} onEdit={onEditMeeting} />
      </View>)}
    </View>
    {undated.length > 0 && <Card soft>
      <Label>Date not set</Label>
      {undated.map((meeting) => <View key={meeting.slotId} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
        <Text style={{ flexShrink: 1 }}>{clubNameFor(meeting.clubId)} · {meetingTitle(meeting, titleFor)}</Text>
        {canEdit && <Action title="Edit meeting" accessibilityLabel={`Edit meeting for ${clubNameFor(meeting.clubId)} without a date`} onPress={() => onEditMeeting(meeting.slotId)} />}
      </View>)}
    </Card>}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  dialog: { width: '100%', maxWidth: 420, gap: 10, padding: 18, borderRadius: radius.media, backgroundColor: '#fffefa' },
});
