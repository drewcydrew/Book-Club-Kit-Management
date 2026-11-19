import { useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions } from "react-native";
import { MemberPreferences, syncMessages, useMemberPreferences } from "../components/member-preferences";
import { StaffPreferences, useStaffPreferences } from "../components/staff-preferences";
import { SCHEDULE_DESKTOP_WIDTH } from "../components/schedule-layout";
import { Action, Actions, Card, Label, Note, Page } from "../components/ui";
import { memberCycleStatus, preferenceStatus } from "../domain/voting";
import { today } from "../domain/dates";
import { useShared } from "../state/shared";
import { useStore } from "../state/store";
import { ScreenGate } from "../components/screen-gate";

export default function Preferences() {
  return <ScreenGate><PreferencesContent /></ScreenGate>;
}

function PreferencesContent() {
  const { width } = useWindowDimensions();
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? "");
  const [clubId, setClubId] = useState("");
  const [cycleOpen, setCycleOpen] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const membershipClubs = person
    ? data.memberships
        .filter((membership) => membership.personId === person.id)
        .map((membership) => membership.clubId)
    : [];
  const availableClubs =
    person?.role === "member"
      ? data.clubs.filter((club) => membershipClubs.includes(club.id))
      : person
        ? data.clubs
        : [];
  const club = availableClubs.find((value) => value.id === clubId) ??
    (availableClubs.length === 1 ? availableClubs[0] : undefined);
  const staff = person?.role === "staff" || person?.role === "admin";
  const wide = Platform.OS === "web" && width >= SCHEDULE_DESKTOP_WIDTH;
  const isMember = !!person && !!club && membershipClubs.includes(club.id);
  const isLeader =
    !!person &&
    data.memberships.some(
      (membership) =>
        membership.personId === person.id &&
        membership.clubId === club?.id &&
        membership.leader,
    );
  const day = today();
  const voting = cycle ? preferenceStatus(cycle, day) : null;
  const memberStatus = cycle ? memberCycleStatus(cycle, day) : null;
  const editable = !!voting?.editable;

  const member = useMemberPreferences({ data, shared, person, cycle, club, isMember, isLeader, editable });
  const staffView = useStaffPreferences({ data, cycle, availableClubs });
  const { sync, syncRefreshError, resetContext, mode, currentDraft, stagedCount, draftSaving } = member;

  function chooseClub(value: string) {
    resetContext();
    setClubId(value);
    setClubOpen(false);
  }

  if (!person)
    return (
      <Page title="Preferences" wide={wide}>
        <Note>
          No demo user is selected on this device. Choose a shared user on the
          Home; no user is selected automatically.
        </Note>
      </Page>
    );
  if (!cycle)
    return (
      <Page title="Preferences" wide={wide}>
        <Note>
          No shared voting cycle is available. Staff can create one, or an
          administrator can run the explicit server demo seed.
        </Note>
      </Page>
    );

  return (
    <Page title="Preferences" wide={wide}>
      <Card soft={!staff}>
        <Label>{cycle.name}{club && !staff ? ` · ${club.name}` : ""}</Label>
        {staff && voting && (
          <Text
            accessibilityRole="text"
            style={[styles.votingStatus, voting.open ? styles.votingOpen : styles.votingClosed]}
          >
            {voting.label} · {voting.detail}
          </Text>
        )}
        {!staff && memberStatus && <>
          <Text accessibilityRole="text" style={[styles.memberStatus, memberStatus.editable ? styles.memberEditable : styles.memberClosed]}>
            {memberStatus.label}
          </Text>
          <Note>{memberStatus.detail}</Note>
        </>}
        {!staff && club && (() => {
          if (mode === 'draft') {
            const text = draftSaving ? 'Saving draft…' : currentDraft?.issue ? 'Draft needs reconciliation.' :
              currentDraft ? 'Unsaved draft for this club and cycle.' : `${stagedCount} unsaved ${stagedCount === 1 ? 'draft' : 'drafts'} across clubs and cycles.`;
            return <Text accessibilityRole="text" accessibilityLiveRegion="polite"
              style={[styles.syncChip, draftSaving && styles.syncSaving, currentDraft?.issue && styles.syncError]}>{text}</Text>;
          }
          const state = syncRefreshError ? "error" : sync.status.state;
          const text = syncRefreshError ? `Unable to refresh choices: ${syncRefreshError}` :
            sync.status.state === "error" ? sync.status.message :
            sync.status.state === "saving" ? syncMessages.saving :
              sync.status.state === "saved" ? syncMessages.saved : syncMessages.idle;
          return <Text accessibilityRole="text" accessibilityLiveRegion="polite"
            style={[styles.syncChip, state === "saving" && styles.syncSaving, state === "saved" && styles.syncSaved, state === "error" && styles.syncError]}>
            {state === "saving" ? "⟳ " : state === "saved" ? "✓ " : state === "error" ? "⚠ " : ""}{text}
          </Text>;
        })()}
        <Actions>
          {data.cycles.length > 1 && <Action title={cycleOpen ? "Close cycles" : "Change cycle"} disabled={!staff && draftSaving} onPress={() => setCycleOpen(!cycleOpen)} />}
          {!staff && availableClubs.length > 1 && <Action title={clubOpen ? "Close clubs" : club ? "Change club" : "Choose club"} disabled={draftSaving} onPress={() => setClubOpen(!clubOpen)} />}
        </Actions>
        {cycleOpen && <Actions>
          {data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} title={value.name} disabled={!staff && draftSaving} onPress={() => {
            setSelectedId(value.id);
            setCycleOpen(false);
            resetContext();
          }} />)}
        </Actions>}
        {!staff && availableClubs.length > 1 && (clubOpen || !club) && <>
          <Label>Choose a club</Label>
          <Actions>
            {availableClubs.map((value) => (
              <Action
                key={value.id}
                selected={value.id === club?.id}
                title={value.name}
                disabled={draftSaving}
                onPress={() => chooseClub(value.id)}
              />
            ))}
          </Actions>
        </>}
      </Card>
      {person.role === "member" && availableClubs.length === 0 && (
        <Note>
          This user has no club memberships. Manage enrolment on Home.
        </Note>
      )}
      {person.role === "member" && availableClubs.length > 0 && !club && (
        <Note>
          Choose a club to view this user’s independent preferences. Memberships
          and preferences are shared across devices.
        </Note>
      )}

      {!staff && club && <MemberPreferences controller={member} wide={wide} />}
      {staff && <StaffPreferences controller={staffView} />}
    </Page>
  );
}

const styles = StyleSheet.create({
  votingStatus: { fontSize: 15, fontWeight: "700" },
  votingOpen: { color: "#245e51" },
  votingClosed: { color: "#7a4b00" },
  memberStatus: { alignSelf: "flex-start", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, fontWeight: "700" },
  memberEditable: { color: "#183f37", backgroundColor: "#dceee2" },
  memberClosed: { color: "#663d00", backgroundColor: "#fff0ce" },
  syncChip: { alignSelf: "flex-start", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 13, color: "#465c56", backgroundColor: "#eef2ef" },
  syncSaving: { color: "#663d00", backgroundColor: "#fff0ce" },
  syncSaved: { color: "#183f37", backgroundColor: "#dceee2" },
  syncError: { color: "#862e27", backgroundColor: "#fbe4e0" },
});
