import { useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from './ui';
import { ClubFilterCard } from './club-filter';
import { ScheduleExportActions } from './schedule-export';
import { SCHEDULE_DESKTOP_WIDTH } from './schedule-layout';
import { MemberSchedule, type MemberView } from './member-schedule';
import { useScheduleConfirmation, type ScheduleEditor } from './schedule-confirmation';
import { memberScheduleMeetings, selectMemberScheduleCycle } from '../domain/cycle-overview';
import { today } from '../domain/dates';
import { makeMemberScheduleExport } from '../domain/schedule-export';
import type { Cycle } from '../domain/model';
import { useStore } from '../state/store';

export function MemberSchedulePage({ editor, cycle }: { editor: ScheduleEditor; cycle: Cycle | undefined }) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= SCHEDULE_DESKTOP_WIDTH;
  const { data } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const { pendingConfirmation, dialogConfirmation, requestDiscard } = useScheduleConfirmation(editor, false);
  const [memberViewMode, setMemberViewMode] = useState<MemberView>('meetings');
  const [memberCycleId, setMemberCycleId] = useState('');
  const [memberCycleOpen, setMemberCycleOpen] = useState(false);
  const [gridClubIds, setGridClubIds] = useState<string[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const personId = person?.id;
  const enrolledClubIds = data.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.clubId);
  const clubChoices = data.clubs.filter((club) => enrolledClubIds.includes(club.id));
  const kitById = new Map(data.kits.map((kit) => [kit.id, kit] as const));
  const titleById = new Map(data.titles.map((title) => [title.id, title] as const));
  const clubById = new Map(data.clubs.map((club) => [club.id, club] as const));
  const gridClubs = gridClubIds ? clubChoices.filter((club) => gridClubIds.includes(club.id)) : clubChoices;
  const gridClubKey = gridClubs.map((club) => club.id).join('|');
  const allMemberMeetings = memberScheduleMeetings(data, enrolledClubIds);
  const memberCycleIds = new Set(allMemberMeetings.map((meeting) => meeting.cycle.id));
  const memberCycles = data.cycles.filter((value) => memberCycleIds.has(value.id));
  const memberCycle = selectMemberScheduleCycle(memberCycles, memberCycleId, today());
  if (memberCycleId !== (memberCycle?.id ?? '')) setMemberCycleId(memberCycle?.id ?? '');
  const shownMemberClubs = new Set(gridClubs.map((club) => club.id));
  const memberMeetings = allMemberMeetings.filter((meeting) => meeting.cycle.id === memberCycle?.id && shownMemberClubs.has(meeting.clubId));
  const discardCard = editor.dirty && <Card>
    <Note>Unsaved staff schedule changes are still held on this device. Discard them before leaving or return to a staff user.</Note>
    <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={requestDiscard} />
  </Card>;

  if (!person) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{dialogConfirmation}{discardCard}<Note>No demo user is selected. Choose a user on Home.</Note></Page>;
  if (!cycle) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{dialogConfirmation}{discardCard}<Note>{!enrolledClubIds.length ? 'You are not enrolled in any clubs. Enrol in a club on Home.' : 'No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.'}</Note></Page>;

  return <Page title="Schedule" wide={wide}>
    {discardCard}
    <Card>
      <Label>{memberCycle ? `${memberCycle.name} · ${memberCycle.status}` : 'Your schedule'}</Label>
      <Actions>
        {memberCycles.length > 1 && <Action title={memberCycleOpen ? 'Close cycles' : 'Change cycle'} expanded={memberCycleOpen} onPress={() => setMemberCycleOpen(!memberCycleOpen)} />}
      </Actions>
      {memberCycleOpen && memberCycles.length > 1 && <Actions>{memberCycles.map((value) =>
        <Action key={value.id} selected={value.id === memberCycle?.id} title={`${value.name} · ${value.status}`} onPress={() => {
          setMemberCycleId(value.id); setMemberCycleOpen(false);
        }} />)}</Actions>}
    </Card>
    {pendingConfirmation}
    {dialogConfirmation}
    <ClubFilterCard title="Your clubs" clubs={clubChoices} selectedIds={gridClubs.map((club) => club.id)}
      onChange={setGridClubIds} open={filtersOpen} onOpenChange={setFiltersOpen}
      emptyMessage="You are not enrolled in any clubs. Enrol in a club on Home." />
    <Card>
      <ScheduleExportActions schedule={makeMemberScheduleExport(data, gridClubs.map((club) => club.id), memberCycle?.id)} disabled={false} />
    </Card>
    <MemberSchedule key={JSON.stringify([person.id, memberCycle?.id, gridClubKey, memberMeetings.map((meeting) =>
      [meeting.key, meeting.date, meeting.month, meeting.cycle.startsOn, meeting.cycle.endsOn,
        meeting.assignment ? kitById.get(meeting.assignment.kitId)?.titleId : null,
        meeting.assignment ? titleById.has(kitById.get(meeting.assignment.kitId)?.titleId ?? '') : false])])}
      view={memberViewMode} onViewChange={setMemberViewMode} meetings={memberMeetings} today={today()}
      emptyMessage={clubChoices.length === 0 ? 'You are not enrolled in any clubs. Enrol in a club on Home.' : !memberCycle ? 'No drafted or published schedules are available for your clubs.' : gridClubs.length === 0 ? 'Select clubs to see their schedule.' : 'No meetings are available for the selected clubs in this cycle.'}
      labels={data.kitLabels}
      titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
      titleIdFor={(assignment) => kitById.get(assignment.kitId)?.titleId}
      clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'} />
  </Page>;
}
