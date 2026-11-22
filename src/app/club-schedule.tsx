import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, useWindowDimensions } from 'react-native';
import { ClubPicker } from '../components/club-picker';
import { MemberSchedule, type MemberView } from '../components/member-schedule';
import { Action, Actions, Card, Label, Note, narrowWidth, styles as uiStyles } from '../components/ui';
import { cadenceLabel } from '../domain/cadence';
import { memberScheduleMeetings } from '../domain/cycle-overview';
import { meetingRuleLabel } from '../domain/meeting-rule';
import { loadClubIndex, loadClubSchedule, type ClubIndexItem, type ClubSchedule } from '../state/api';
import { useSelection } from '../state/selection';
import { useLibraryService } from '../state/library-service';

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

export default function ClubSchedulePage() {
  const { serviceId, clubId } = useLocalSearchParams<{ serviceId?: string | string[]; clubId?: string | string[] }>();
  const library = useLibraryService();
  const [refreshError, setRefreshError] = useState('');
  const hasServiceParam = serviceId !== undefined;
  const hasClubParam = clubId !== undefined;
  const validClub = !hasClubParam || (typeof clubId === 'string' && clubId.length > 0);
  const target = hasServiceParam
    ? typeof serviceId === 'string' && serviceId.length > 0 ? library.services.find((item) => item.id === serviceId) : undefined
    : !hasClubParam ? library.service : undefined;
  if (!target || !validClub) {
    const message = !target && library.error
      ? 'Unable to load library services. Try again.'
      : !validClub ? 'The club in this link is invalid.'
        : hasServiceParam || hasClubParam ? 'The library service in this link is unavailable or missing.'
          : 'Select a library service on Home to view schedules.';
    return <ScrollView contentContainerStyle={uiStyles.page}>
      <Text accessibilityRole="header" style={uiStyles.heading}>Club schedule</Text>
      <Note>{message}</Note>
      {refreshError ? <Text style={uiStyles.error}>{refreshError}</Text> : null}
      {!target && library.error && <Action title="Try again" onPress={() => {
        setRefreshError('');
        void library.refresh().catch((error: unknown) => setRefreshError(errorMessage(error)));
      }} />}
      <Action title="Go to Home" onPress={() => router.navigate('/')} />
    </ScrollView>;
  }
  return <ClubScheduleContent serviceId={target.id} clubId={typeof clubId === 'string' ? clubId : null}
    selectedService={library.service?.id === target.id} />;
}

function ClubScheduleContent({ serviceId, clubId, selectedService }: { serviceId: string; clubId: string | null; selectedService: boolean }) {
  const { person } = useSelection();
  const { width: windowWidth } = useWindowDimensions();
  const pageStyle = [uiStyles.page, uiStyles.widePage, windowWidth < narrowWidth && { paddingHorizontal: 12 }];
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<MemberView>('overview');
  const [copied, setCopied] = useState(false);
  const selectedClubId = clubId;
  const requestKey = JSON.stringify([serviceId, selectedClubId, reloadKey]);
  const current = loaded?.key === requestKey ? loaded : null;
  const schedule = current?.schedule ?? null;
  const clubs = current?.clubs ?? null;
  const error = current?.error ?? null;
  const staff = selectedService && person !== undefined && person.role !== 'member';

  useEffect(() => {
    const controller = new AbortController();
    const fail = (failure: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key: requestKey, error: errorMessage(failure) });
    };
    if (selectedClubId) {
      loadClubSchedule(selectedClubId, controller.signal, serviceId)
        .then((value) => { if (!controller.signal.aborted) setLoaded({ key: requestKey, schedule: value }); }, fail);
    } else {
      loadClubIndex(controller.signal, serviceId)
        .then((value) => { if (!controller.signal.aborted) setLoaded({ key: requestKey, clubs: value }); }, fail);
    }
    return () => controller.abort();
  }, [requestKey, selectedClubId, serviceId]);

  const titleById = useMemo(() => new Map(schedule?.titles.map((title) => [title.id, title]) ?? []), [schedule]);
  const kitById = useMemo(() => new Map(schedule?.kits.map((kit) => [kit.id, kit]) ?? []), [schedule]);
  const meetings = useMemo(() => schedule
    ? memberScheduleMeetings({ cycles: schedule.cycles, assignments: schedule.assignments }, [schedule.club.id])
    : [], [schedule]);

  const refresh = () => setReloadKey((key) => key + 1);
  const shareUrl = selectedClubId && typeof window !== 'undefined'
    ? `${window.location.origin}/club-schedule?serviceId=${encodeURIComponent(serviceId)}&clubId=${encodeURIComponent(selectedClubId)}`
    : selectedClubId ? `/club-schedule?serviceId=${encodeURIComponent(serviceId)}&clubId=${encodeURIComponent(selectedClubId)}` : '';

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
      {clubs ? <ClubPicker clubs={clubs} onPress={(club) => router.setParams({ serviceId, clubId: club.id })} /> : null}
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
      clubNameFor={() => club.name}
      exportClub={{ name: club.name, details: `${club.branch} · ${meetingRuleLabel(club)} · ${cadenceLabel(club.cadence, club.cadenceOffset)}` }} />
    <Actions>
      <Action title="Choose another club" onPress={() => router.replace({ pathname: '/club-schedule', params: { serviceId } })} />
      <Action title="Refresh" onPress={refresh} />
    </Actions>
  </ScrollView>;
}
