import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { MemberSchedule, type MemberView } from '../components/member-schedule';
import { Action, Actions, Card, Label, Note, styles as uiStyles } from '../components/ui';
import { cadenceLabel } from '../domain/cadence';
import { memberScheduleMeetings } from '../domain/cycle-overview';
import { meetingRuleLabel } from '../domain/meeting-rule';
import { loadClubIndex, loadClubSchedule, type ClubIndexItem, type ClubSchedule } from '../state/api';
import { useSelection } from '../state/selection';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

type LoadState = { key: string; schedule?: ClubSchedule; clubs?: ClubIndexItem[]; error?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load the club schedule.';
}

const pageStyle = [uiStyles.page, uiStyles.widePage];

export default function ClubSchedulePage() {
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  const { person } = useSelection();
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<MemberView>('overview');
  const [copied, setCopied] = useState(false);
  const selectedClubId = typeof clubId === 'string' && clubId ? clubId : null;
  const requestKey = `${selectedClubId ?? ''}:${reloadKey}`;
  const current = loaded?.key === requestKey ? loaded : null;
  const schedule = current?.schedule ?? null;
  const clubs = current?.clubs ?? null;
  const error = current?.error ?? null;
  const staff = person !== undefined && person.role !== 'member';

  useEffect(() => {
    const controller = new AbortController();
    const fail = (failure: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key: requestKey, error: errorMessage(failure) });
    };
    if (selectedClubId) {
      loadClubSchedule(selectedClubId, controller.signal)
        .then((value) => setLoaded({ key: requestKey, schedule: value }), fail);
    } else {
      loadClubIndex(controller.signal)
        .then((value) => setLoaded({ key: requestKey, clubs: value }), fail);
    }
    return () => controller.abort();
  }, [requestKey, selectedClubId]);

  const titleById = useMemo(() => new Map(schedule?.titles.map((title) => [title.id, title]) ?? []), [schedule]);
  const kitById = useMemo(() => new Map(schedule?.kits.map((kit) => [kit.id, kit]) ?? []), [schedule]);
  const meetings = useMemo(() => schedule
    ? memberScheduleMeetings({ cycles: schedule.cycles, assignments: schedule.assignments }, [schedule.club.id])
    : [], [schedule]);

  const refresh = () => setReloadKey((key) => key + 1);
  const shareUrl = selectedClubId && typeof window !== 'undefined'
    ? `${window.location.origin}/club-schedule?clubId=${encodeURIComponent(selectedClubId)}`
    : selectedClubId ? `/club-schedule?clubId=${encodeURIComponent(selectedClubId)}` : '';

  function copyLink() {
    if (Platform.OS !== 'web' || !shareUrl) return;
    void navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true), () => setCopied(false));
  }

  const header = <Text accessibilityRole="header" style={uiStyles.heading}>Club schedule</Text>;

  if (!selectedClubId) {
    return <ScrollView contentContainerStyle={pageStyle} keyboardShouldPersistTaps="handled">
      {header}
      <Note>Choose a club to see its complete planning schedule.</Note>
      {error ? <Text style={uiStyles.error}>{error}</Text> : null}
      {clubs === null && !error ? <Note>Loading clubs…</Note> : null}
      {clubs?.length === 0 ? <Note>No clubs are available yet.</Note> : null}
      <Actions>
        {clubs?.map((club) => <Action key={club.id} title={`${club.name} · ${club.branch}`}
          onPress={() => router.setParams({ clubId: club.id })} />)}
      </Actions>
    </ScrollView>;
  }

  if (error) {
    return <ScrollView contentContainerStyle={pageStyle}>
      {header}
      <Text style={uiStyles.error}>{error}</Text>
      <Action title="Try again" onPress={refresh} />
    </ScrollView>;
  }

  if (!schedule) {
    return <ScrollView contentContainerStyle={pageStyle}>{header}<Note>Loading club schedule…</Note></ScrollView>;
  }

  const { club, cycles } = schedule;
  const titleFor = (assignment: { kitId: string }) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '');
  const titleIdFor = (assignment: { kitId: string }) => kitById.get(assignment.kitId)?.titleId;
  const cycleSummary = cycles.length
    ? cycles.map((cycle) => `${cycle.name} (${cycle.status})`).join(', ')
    : 'No drafted or published schedules are available yet.';

  return <ScrollView contentContainerStyle={pageStyle} keyboardShouldPersistTaps="handled">
    {header}
    <Card>
      <Text accessibilityRole="header" style={[uiStyles.heading, { fontSize: 24 }]}>{club.name}</Text>
      <Note>{club.branch} · {meetingRuleLabel(club)} · {cadenceLabel(club.cadence, club.cadenceOffset)}</Note>
      <Label>Pickup & address</Label>
      <Note>{club.pickup === 'pickup' ? 'Pickup' : 'Delivery'} · {club.address || 'No address recorded'}</Note>
      <Label>Members</Label>
      <Note>{club.size} {club.size === 1 ? 'member' : 'members'}</Note>
      <Label>Schedules</Label>
      <Note>{cycleSummary}</Note>
    </Card>
    {staff && selectedClubId && <Card soft>
      <Label>Share with club members</Label>
      <Note>{shareUrl}</Note>
      {Platform.OS === 'web'
        ? <Actions><Action title={copied ? 'Link copied' : 'Copy link'} onPress={copyLink} /></Actions>
        : null}
    </Card>}
    <MemberSchedule view={view} onViewChange={setView} meetings={meetings} today={todayIso()}
      emptyMessage="No meetings are scheduled for this club yet."
      labels={schedule.kitLabels} titleFor={titleFor} titleIdFor={titleIdFor}
      clubNameFor={() => club.name} />
    <Actions>
      <Action title="Choose another club" onPress={() => router.navigate('/club-schedule')} />
      <Action title="Refresh" onPress={refresh} />
    </Actions>
  </ScrollView>;
}
