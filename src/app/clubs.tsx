import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useDraftNavigationGuard } from "../components/navigation-guard";
import { SearchPicker } from "../components/search-picker";
import { TitleCover } from "../components/title-cover";
import {
  Action,
  Actions,
  Card,
  Field,
  Label,
  Note,
  Page,
  styles as uiStyles,
} from "../components/ui";
import type { Club, Membership } from "../domain/model";
import { cadenceLabel } from "../domain/cadence";
import { meetingOccurrences, meetingRuleLabel, meetingWeekdays } from "../domain/meeting-rule";
import type { PickerOption } from "../domain/search";
import {
  ApiError,
  deleteClub,
  previewClubDeletion,
  saveHistory,
  saveMemberships,
  saveRecord,
  setClubKit,
} from "../state/api";
import type { ClubDeletionPreview, SharedData } from "../state/api";
import { useShared } from "../state/shared";
import { ScreenGate } from "../components/screen-gate";
import { useStore } from "../state/store";

type Section = "details" | "members" | "history";
type SyncState = {
  kind: "idle" | "pending" | "saving" | "saved" | "failed" | "invalid";
  message?: string;
};
type Draft = {
  club: Club;
  sizeText: string;
  members: Membership[];
  history: string[];
};
type Revisions = { club: number; membership: number };
type Confirmed = Record<Section, string>;
type KeyTarget = {
  addEventListener: (
    type: "keydown",
    listener: (event: { key: string }) => void,
  ) => void;
  removeEventListener: (
    type: "keydown",
    listener: (event: { key: string }) => void,
  ) => void;
};

const sectionLabels: Record<Section, string> = {
  details: "Details",
  members: "Members",
  history: "Reading history",
};

const blankClub = (branch: string): Club => ({
  id: "",
  name: "",
  branch,
  leaderId: "",
  size: 1,
  cadence: 1,
  meetingWeekday: 1,
  meetingOccurrence: 1,
  pickup: "pickup",
  address: "",
  history: [],
  revision: 0,
  membershipRevision: 0,
});

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function detailsKey(value: Draft) {
  const { club, sizeText } = value;
  return JSON.stringify([
    club.name,
    club.branch,
    sizeText,
    club.cadence,
    club.meetingWeekday,
    club.meetingOccurrence,
    club.pickup,
    club.address,
  ]);
}

function membersKey(value: Draft) {
  return JSON.stringify(
    value.members
      .map((member) => [member.personId, member.leader])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

function historyKey(value: Draft) {
  return JSON.stringify(value.history);
}

function keyFor(section: Section, value: Draft) {
  if (section === "details") return detailsKey(value);
  if (section === "members") return membersKey(value);
  return historyKey(value);
}

function keysFor(value: Draft): Confirmed {
  return {
    details: detailsKey(value),
    members: membersKey(value),
    history: historyKey(value),
  };
}

function detailsError(value: Draft): string | null {
  const count = Number(value.sizeText);
  if (!value.club.name.trim() || !value.club.branch.trim())
    return "Enter a club name and branch.";
  if (!Number.isInteger(count) || count < 1)
    return "Club size must be a positive whole number.";
  if (value.club.pickup === "delivery" && !value.club.address.trim())
    return "Enter a delivery address for delivery clubs.";
  return null;
}

function membersError(value: Draft): string | null {
  return value.members.filter((member) => member.leader).length > 1
    ? "A club can have only one leader."
    : null;
}

function clubPayload(value: Draft, revision: number | null) {
  const {
    leaderId: _leaderId,
    history: _history,
    membershipRevision: _membershipRevision,
    revision: _revision,
    ...fields
  } = value.club;
  return {
    ...fields,
    name: value.club.name.trim(),
    branch: value.club.branch.trim(),
    size: Number(value.sizeText),
    ...(revision === null ? {} : { revision }),
  };
}

function serverState(fresh: SharedData, clubId: string, leaderId: string) {
  const record = fresh.clubs.find((item) => item.id === clubId);
  if (!record) return null;
  const membership = fresh.membershipRevisions.find(
    (item) => item.clubId === clubId,
  );
  const titles =
    fresh.history.find((item) => item.clubId === clubId)?.titles ?? [];
  const revisions: Revisions = {
    club: record.revision,
    membership: membership?.revision ?? 0,
  };
  return {
    club: {
      ...record,
      leaderId,
      history: titles,
      membershipRevision: revisions.membership,
    },
    members: fresh.memberships.filter((item) => item.clubId === clubId),
    history: titles,
    revisions,
  };
}

function syncText(state: SyncState) {
  switch (state.kind) {
    case "pending":
      return "Waiting to save…";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "failed":
      return `Not saved${state.message ? `: ${state.message}` : ""}`;
    case "invalid":
      return state.message ?? "Check the fields";
    default:
      return "";
  }
}

function SyncLine({
  state,
  onRetry,
  onRevert,
}: {
  state: SyncState;
  onRetry: () => void;
  onRevert: () => void;
}) {
  if (state.kind === "idle") return null;
  const problem = state.kind === "failed" || state.kind === "invalid";
  return (
    <View style={modalStyles.sync}>
      <Text style={problem ? modalStyles.syncError : modalStyles.syncText}>
        {syncText(state)}
      </Text>
      {problem && (
        <Actions>
          {state.kind === "failed" && (
            <Action title="Retry" onPress={onRetry} />
          )}
          <Action title="Revert to shared" onPress={onRevert} />
        </Actions>
      )}
    </View>
  );
}

function Fold({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={modalStyles.fold}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={modalStyles.foldHeader}
      >
        <Text style={modalStyles.foldTitle}>
          {open ? "▾" : "▸"} {title}
        </Text>
        <Text style={modalStyles.foldSummary}>{summary}</Text>
      </Pressable>
      {open ? <View style={modalStyles.foldBody}>{children}</View> : null}
    </View>
  );
}

const defaultOpen: Record<Section, boolean> = {
  details: true,
  members: false,
  history: false,
};

const idleStatus: Record<Section, SyncState> = {
  details: { kind: "idle" },
  members: { kind: "idle" },
  history: { kind: "idle" },
};

export default function Clubs() {
  return <ScreenGate staffOnly><ClubsContent /></ScreenGate>;
}

function ClubsContent() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === "admin" || person?.role === "staff";
  const busy = shared.saving;
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    revision: number;
    loading: boolean;
    preview: ClubDeletionPreview | null;
    error: string;
  } | null>(null);
  const deletionInFlight = useRef(false);
  const [unlinking, setUnlinking] = useState<{
    clubId: string;
    kitId: string;
  } | null>(null);
  const [openClubs, setOpenClubs] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Record<Section, SyncState>>(idleStatus);
  const [open, setOpen] = useState<Record<Section, boolean>>(defaultOpen);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSelectedOnly, setMemberSelectedOnly] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [titleSelectedOnly, setTitleSelectedOnly] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const confirmedRef = useRef<Confirmed>({
    details: "",
    members: "",
    history: "",
  });
  const revisionRef = useRef<Revisions>({ club: 0, membership: 0 });
  const queueRef = useRef<Section[]>([]);
  const drainingRef = useRef(false);
  const detailsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isNew = !!draft && !draft.club.id;
  const newDirty =
    !!draft &&
    !draft.club.id &&
    (draft.club.name.trim() !== "" ||
      draft.club.address.trim() !== "" ||
      draft.sizeText !== "1");

  const states = Object.values(status);
  const pendingSave = busy || states.some((state) => state.kind === "pending" || state.kind === "saving");
  const unsaved = newDirty || states.some((state) => state.kind === "failed" || state.kind === "invalid");
  const navigationConfirmation = useDraftNavigationGuard(unsaved, pendingSave);

  function unlinkedKitOptions(clubId: string): PickerOption[] {
    return data.kits
      .filter(
        (kit) =>
          !shared.data.links.some(
            (link) => link.clubId === clubId && link.kitId === kit.id,
          ),
      )
      .map((kit) => ({
        id: kit.id,
        label: `${kit.barcode} · ${data.titles.find((title) => title.id === kit.titleId)?.name ?? "Title unavailable"}`,
        detail: `${kit.status} · ${kit.branch}`,
        group: kit.branch,
      }));
  }

  function setSection(section: Section, state: SyncState) {
    setStatus((current) => ({ ...current, [section]: state }));
  }

  function updateDraft(change: (current: Draft) => Draft) {
    const current = draftRef.current;
    if (!current) return;
    const next = change(current);
    draftRef.current = next;
    setDraft(next);
  }

  function hasUnsettledWork() {
    return (
      drainingRef.current ||
      detailsTimer.current !== null ||
      Object.values(status).some(
        (state) =>
          state.kind === "pending" ||
          state.kind === "saving" ||
          state.kind === "failed" ||
          state.kind === "invalid",
      )
    );
  }

  // Background saves run one section at a time so each sends the latest revision.
  function queueSync(section: Section) {
    setSection(section, { kind: "pending" });
    if (!queueRef.current.includes(section)) queueRef.current.push(section);
    void drain();
  }

  async function drain() {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      let next = queueRef.current.shift();
      while (next) {
        await runSync(next);
        next = queueRef.current.shift();
      }
    } finally {
      drainingRef.current = false;
    }
  }

  async function runSync(section: Section) {
    const current = draftRef.current;
    if (!current || !current.club.id) return;
    const sentKey = keyFor(section, current);
    if (sentKey === confirmedRef.current[section]) {
      setSection(section, { kind: "saved" });
      return;
    }
    const problem =
      section === "details"
        ? detailsError(current)
        : section === "members"
          ? membersError(current)
          : null;
    if (problem) {
      setSection(section, { kind: "invalid", message: problem });
      return;
    }
    setSection(section, { kind: "saving" });
    try {
      if (section === "details") {
        const saved = await shared.mutate(() =>
          saveRecord("clubs", clubPayload(current, revisionRef.current.club)),
        );
        if (!("pickup" in saved))
          throw new Error("Server returned an invalid club.");
        revisionRef.current.club = saved.revision;
      } else if (section === "members") {
        revisionRef.current.membership = await shared.mutate(() =>
          saveMemberships(
            current.club.id,
            current.members,
            revisionRef.current.membership,
          ),
        );
      } else {
        revisionRef.current.club = await shared.mutate(() =>
          saveHistory(
            current.club.id,
            current.history,
            revisionRef.current.club,
          ),
        );
      }
    } catch (error: unknown) {
      const reason = errorText(error, "Unable to save changes.");
      setSection(section, { kind: "failed", message: reason });
      setOpen((currentOpen) => ({ ...currentOpen, [section]: true }));
      setMessage(`${sectionLabels[section]} not saved. ${reason}`);
      return;
    }
    confirmedRef.current[section] = sentKey;
    const latest = draftRef.current;
    if (latest?.club.id && keyFor(section, latest) !== sentKey) {
      queueSync(section);
      return;
    }
    setSection(section, { kind: "saved" });
  }

  async function retry(section: Section) {
    const current = draftRef.current;
    if (!current) return;
    try {
      const state = serverState(
        await shared.refresh(),
        current.club.id,
        current.club.leaderId,
      );
      if (!state) throw new Error("Club is no longer available.");
      revisionRef.current = state.revisions;
    } catch (error: unknown) {
      setSection(section, {
        kind: "failed",
        message: errorText(error, "Unable to refresh shared data."),
      });
      return;
    }
    queueSync(section);
  }

  async function revert(section: Section) {
    const current = draftRef.current;
    if (!current) return;
    try {
      const state = serverState(
        await shared.refresh(),
        current.club.id,
        current.club.leaderId,
      );
      if (!state) throw new Error("Club is no longer available.");
      const next: Draft =
        section === "details"
          ? { ...current, club: state.club, sizeText: String(state.club.size) }
          : section === "members"
            ? { ...current, members: state.members }
            : { ...current, history: state.history };
      revisionRef.current = state.revisions;
      confirmedRef.current[section] = keyFor(section, next);
      updateDraft(() => next);
      setSection(section, { kind: "idle" });
      setMessage(`${sectionLabels[section]} reverted to the shared version.`);
    } catch (error: unknown) {
      setSection(section, {
        kind: "failed",
        message: errorText(error, "Unable to revert."),
      });
    }
  }

  function scheduleDetails() {
    if (detailsTimer.current) clearTimeout(detailsTimer.current);
    setSection("details", { kind: "pending" });
    detailsTimer.current = setTimeout(() => {
      detailsTimer.current = null;
      queueSync("details");
    }, 700);
  }

  function flushDetails() {
    if (!detailsTimer.current) return;
    clearTimeout(detailsTimer.current);
    detailsTimer.current = null;
    queueSync("details");
  }

  useEffect(() => () => { if (detailsTimer.current) clearTimeout(detailsTimer.current); }, []);

  function edit(value: Club) {
    const current = draftRef.current;
    if (value.id && current?.club.id === value.id) {
      setFormOpen(true);
      return;
    }
    if (current?.club.id && hasUnsettledWork()) {
      setMessage(
        "Finish saving or revert the open club before opening another.",
      );
      return;
    }
    const next: Draft = {
      club: value,
      sizeText: String(value.size),
      members: data.memberships.filter(
        (membership) => membership.clubId === value.id,
      ),
      history: [...value.history],
    };
    draftRef.current = next;
    setDraft(next);
    revisionRef.current = {
      club: value.revision,
      membership: value.membershipRevision,
    };
    confirmedRef.current = keysFor(next);
    setStatus(idleStatus);
    setOpen(defaultOpen);
    setMemberQuery("");
    setMemberSelectedOnly(false);
    setTitleQuery("");
    setTitleSelectedOnly(false);
    setMessage("");
    setDiscardPrompt(false);
    setFormOpen(true);
  }

  function changeDetails(patch: Partial<Club>, sizeText?: string) {
    if (!draftRef.current) return;
    updateDraft((current) => ({
      ...current,
      club: { ...current.club, ...patch },
      sizeText: sizeText ?? current.sizeText,
    }));
    if (draftRef.current?.club.id) scheduleDetails();
  }

  function toggleMember(personId: string) {
    updateDraft((current) => {
      const selected = current.members.some(
        (member) => member.personId === personId,
      );
      return {
        ...current,
        members: selected
          ? current.members.filter((member) => member.personId !== personId)
          : [
              ...current.members,
              { personId, clubId: current.club.id, leader: false },
            ],
      };
    });
    queueSync("members");
  }

  function toggleLeader(personId: string) {
    updateDraft((current) => {
      const member = current.members.find(
        (entry) => entry.personId === personId,
      );
      if (!member) return current;
      const leader = !member.leader;
      return {
        ...current,
        members: current.members.map((entry) =>
          entry.personId === personId
            ? { ...entry, leader }
            : leader
              ? { ...entry, leader: false }
              : entry,
        ),
      };
    });
    queueSync("members");
  }

  function toggleTitle(titleId: string) {
    updateDraft((current) => ({
      ...current,
      history: current.history.includes(titleId)
        ? current.history.filter((id) => id !== titleId)
        : [...current.history, titleId],
    }));
    queueSync("history");
  }

  function createClub() {
    const current = draftRef.current;
    if (!current) return;
    const problem = detailsError(current);
    if (problem) {
      setMessage(problem);
      return;
    }
    const payload = clubPayload(current, null);
    void shared
      .mutate(() => saveRecord("clubs", payload))
      .then((saved) => {
        if (!("pickup" in saved))
          throw new Error("Server returned an invalid club.");
        const next: Draft = {
          club: { ...saved, leaderId: "", history: [], membershipRevision: 0 },
          sizeText: String(saved.size),
          members: [],
          history: [],
        };
        revisionRef.current = { club: saved.revision, membership: 0 };
        confirmedRef.current = keysFor(next);
        draftRef.current = next;
        setDraft(next);
        setStatus(idleStatus);
        setMessage(
          "Club created. Members and reading history can now be added.",
        );
      })
      .catch((error: unknown) =>
        setMessage(errorText(error, "Unable to create club.")),
      );
  }

  function closeModal() {
    flushDetails();
    setDiscardPrompt(false);
    setFormOpen(false);
  }

  function requestClose() {
    if (newDirty) {
      setDiscardPrompt(true);
      return;
    }
    closeModal();
  }

  function discardNewClub() {
    setDiscardPrompt(false);
    draftRef.current = null;
    setDraft(null);
    setFormOpen(false);
  }

  useEffect(() => {
    if (Platform.OS !== "web" || !formOpen) return;
    const target = globalThis as unknown as KeyTarget;
    const onKey = (event: { key: string }) => {
      if (event.key === "Escape") requestClose();
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  });

  function toggleSection(section: Section) {
    setOpen((current) => ({ ...current, [section]: !current[section] }));
  }

  async function beginDeletion(value: Club) {
    if (person?.role !== "admin" || busy || deletionInFlight.current) return;
    if (draftRef.current?.club.id === value.id && hasUnsettledWork()) {
      setMessage("Finish saving or revert this club's edits before deleting it.");
      return;
    }
    const record = shared.data.clubs.find((item) => item.id === value.id);
    if (!record) { setMessage("Club is no longer available. Refresh shared data."); return; }
    deletionInFlight.current = true;
    setMessage("");
    setDeleting({ id: record.id, name: record.name, revision: record.revision, loading: true, preview: null, error: "" });
    try {
      const preview = await previewClubDeletion(record.id, record.revision);
      setDeleting({ id: record.id, name: record.name, revision: record.revision, loading: false, preview, error: "" });
    } catch (error: unknown) {
      setDeleting({ id: record.id, name: record.name, revision: record.revision, loading: false, preview: null,
        error: `${errorText(error, "Unable to load deletion details.")} Refresh shared data before reviewing again.` });
    } finally { deletionInFlight.current = false; }
  }

  async function confirmDeletion() {
    if (!deleting?.preview || person?.role !== "admin" || busy || deletionInFlight.current) return;
    const { id, revision, preview } = deleting;
    deletionInFlight.current = true;
    setDeleting({ ...deleting, loading: true, error: "" });
    let completed = false;
    let started = false;
    let failure: unknown;
    try {
      await shared.mutate(async () => {
        started = true;
        try { await deleteClub(id, revision, preview.token); completed = true; }
        catch (error: unknown) { failure = error; throw error; }
      });
      if (draftRef.current?.club.id === id) { draftRef.current = null; setDraft(null); }
      setDeleting(null);
      setMessage("Club permanently deleted from shared data.");
    } catch (error: unknown) {
      const knownRejection = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
      const detail = errorText(knownRejection ? failure : error, "Unable to delete club.");
      const outcome = completed ? "The club was deleted, but refreshing failed."
        : started && !knownRejection ? "Deletion may have completed."
          : detail;
      setDeleting({ id, name: preview.club.name, revision, loading: false, preview: null,
        error: `${outcome} Refresh shared data and inspect the club before reviewing again.` });
    } finally { deletionInFlight.current = false; }
  }

  const visibleClubs = data.clubs.filter(
    (value) =>
      staff ||
      data.memberships.some(
        (membership) =>
          membership.personId === person?.id && membership.clubId === value.id,
      ),
  );

  const query = memberQuery.trim().toLowerCase();
  const memberRows = draft
    ? data.people.filter((candidate) => {
        const selected = draft.members.some(
          (member) => member.personId === candidate.id,
        );
        return (
          (!memberSelectedOnly || selected) &&
          candidate.name.toLowerCase().includes(query)
        );
      })
    : [];
  const titleQueryText = titleQuery.trim().toLowerCase();
  const titleRows = draft
    ? data.titles.filter(
        (title) =>
          (!titleSelectedOnly || draft.history.includes(title.id)) &&
          title.name.toLowerCase().includes(titleQueryText),
      )
    : [];

  return (
    <Page title="Clubs">
      {navigationConfirmation}
      <Actions>
        <Action
          title="Refresh shared clubs and memberships"
          onPress={() => {
            void shared.refresh().catch(() => undefined);
          }}
        />
        {staff && (
          <Action
            tone="primary"
            title="Add club"
            onPress={() => edit(blankClub(data.library.branches[0] ?? ""))}
          />
        )}
      </Actions>
      <Note>
        Clubs, membership, leadership, reading history and kit links are shared.
        Kit links do not mean kits are checked out. Roles and leader controls
        are interface-only; the API is publicly writable.
      </Note>
      {data.clubs.length === 0 && (
        <Note>
          No shared clubs yet. Staff can create one, or an administrator can run
          the explicit demo seed.
        </Note>
      )}
      {deleting && person?.role === "admin" && (
        <Modal transparent visible onRequestClose={() => { if (!deleting.loading) setDeleting(null); }} accessibilityLabel="Delete club">
          <View style={modalStyles.backdrop}><View style={modalStyles.dialog}>
            <ScrollView contentContainerStyle={modalStyles.content}>
              <Label>Permanently delete {deleting.name}?</Label>
              <Note>This removes the club and its related records for everyone. This cannot be undone.</Note>
              {deleting.loading && <Note>{deleting.preview ? "Deleting club…" : "Loading deletion details…"}</Note>}
              {deleting.error ? <Text accessibilityRole="alert" style={modalStyles.syncError}>{deleting.error}</Text> : null}
              {deleting.preview && <>
                <Note>Remove {countLabel(deleting.preview.counts.memberships, "membership")},
                  {" "}{countLabel(deleting.preview.counts.kitLinks, "kit link")},
                  {" "}{countLabel(deleting.preview.counts.history, "history entry", "history entries")},
                  {" "}{countLabel(deleting.preview.counts.ballots, "ballot")} and
                  {" "}{countLabel(deleting.preview.counts.ballotMarks, "ballot mark")},
                  {" "}{countLabel(deleting.preview.counts.finalizedGroups, "finalized group")} and
                  {" "}{countLabel(deleting.preview.counts.finalizedRankings, "ranking")},
                  {" "}{countLabel(deleting.preview.counts.slots, "meeting")} and
                  {" "}{countLabel(deleting.preview.counts.assignments, "assignment")} ({deleting.preview.counts.lockedAssignments} locked).</Note>
                {deleting.preview.cycles.map((cycle) => <Note key={cycle.id}>
                  {cycle.name} · {cycle.status}: {countLabel(cycle.slots, "meeting")} and {countLabel(cycle.assignments, "assignment")} removed.
                  {cycle.status === "published" && cycle.remainingSlots === 0 ? " It will remain published with no meetings." : ""}
                </Note>)}
                <Note>People, titles, kits, kit statuses, circulation events, other clubs and cycles are retained.
                  Published schedule information, due dates and loan associations for this club can disappear.</Note>
                {deleting.preview.affectedKits.length > 0 && <View>
                  <Text style={modalStyles.syncError}>Reserved or checked-out kits need manual follow-up. Their status is not changed:</Text>
                  {deleting.preview.affectedKits.map((kit) => <Text key={kit.id}>{kit.barcode} · {kit.status}</Text>)}
                  <Note>Kit status is shared and may not identify which club holds the kit.</Note>
                </View>}
                <Note>Development workflow only; this is not a production-safe circulation or audit process.</Note>
              </>}
              <Actions>
                {deleting.preview && <Action tone="danger" title="Confirm permanent deletion" disabled={deleting.loading || busy} onPress={() => { void confirmDeletion(); }} />}
                <Action title="Cancel deletion" disabled={deleting.loading || busy} onPress={() => setDeleting(null)} />
              </Actions>
            </ScrollView>
          </View></View>
        </Modal>
      )}
      {unlinking && (
        <Card>
          <Label>Remove this shared kit link?</Label>
          <Actions>
            <Action
              tone="danger"
              title="Confirm unlink"
              onPress={() => {
                void shared
                  .mutate(() =>
                    setClubKit(unlinking.clubId, unlinking.kitId, false),
                  )
                  .then(() => {
                    setUnlinking(null);
                    setMessage("Kit unlinked.");
                  })
                  .catch((error: unknown) =>
                    setMessage(errorText(error, "Unable to unlink kit.")),
                  );
              }}
            />
            <Action title="Cancel unlink" onPress={() => setUnlinking(null)} />
          </Actions>
        </Card>
      )}
      {visibleClubs.map((value) => {
        const members = data.memberships.filter(
          (membership) => membership.clubId === value.id,
        );
        const links = shared.data.links.filter(
          (link) => link.clubId === value.id,
        );
        return (
          <Card key={value.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !!openClubs[value.id] }}
              onPress={() =>
                setOpenClubs((current) => ({
                  ...current,
                  [value.id]: !current[value.id],
                }))
              }
            >
              <Label>
                {openClubs[value.id] ? "▾" : "▸"} {value.name} ·{" "}
                {members.length} members · {links.length} kits
              </Label>
            </Pressable>
            {openClubs[value.id] && (
              <>
                <Note>
                  {value.branch} · {value.size} members · {cadenceLabel(value.cadence)} · {meetingRuleLabel(value)} ·{" "}
                  {value.pickup}
                </Note>
                {value.pickup === "delivery" ? (
                  <Text>{value.address}</Text>
                ) : null}
                <Text>
                  Leader:{" "}
                  {data.people.find((p) => p.id === value.leaderId)?.name ??
                    "Not assigned"}
                </Text>
                <Text>
                  Members:{" "}
                  {members
                    .map(
                      (membership) =>
                        `${data.people.find((p) => p.id === membership.personId)?.name ?? "Unavailable user"}${membership.leader ? " (leader)" : ""}`,
                    )
                    .join(", ") || "None"}
                </Text>
                <Text>
                  Previously read:{" "}
                  {value.history
                    .map(
                      (titleId) =>
                        data.titles.find((t) => t.id === titleId)?.name ??
                        `${titleId} (unavailable)`,
                    )
                    .join(", ") || "None"}
                </Text>
                <Label>Linked kits · {links.length}</Label>
                {links.map((link) => {
                  const kit = data.kits.find((item) => item.id === link.kitId);
                  const linkedTitle = kit
                    ? data.titles.find((title) => title.id === kit.titleId)
                    : undefined;
                  return (
                    <Actions key={link.kitId}>
                      {linkedTitle && (
                        <TitleCover
                          coverUrl={linkedTitle.coverUrl}
                          isbn={linkedTitle.isbn}
                          style={{ width: 32, height: 48, marginRight: 0 }}
                        />
                      )}
                      <Text>
                        {kit
                          ? `${kit.barcode} · ${data.titles.find((title) => title.id === kit.titleId)?.name ?? "Title unavailable"}`
                          : "Kit unavailable"}
                      </Text>
                      {staff && (
                        <Action
                          tone="danger"
                          title={`Unlink ${kit?.barcode ?? link.kitId}`}
                          onPress={() => setUnlinking(link)}
                        />
                      )}
                    </Actions>
                  );
                })}
                {staff && (
                  <>
                    <SearchPicker
                      label="Link a kit"
                      options={unlinkedKitOptions(value.id)}
                      selectedId=""
                      groups={[
                        { value: "all", label: "All branches" },
                        ...data.library.branches.map((branch) => ({
                          value: branch,
                          label: branch,
                        })),
                      ]}
                      summary="Search kits to link"
                      disabled={busy}
                      closeOnSelect={false}
                      onSelect={(kitId) => {
                        void shared
                          .mutate(() => setClubKit(value.id, kitId, true))
                          .then(() => setMessage("Shared kit link saved."))
                          .catch((error: unknown) =>
                            setMessage(errorText(error, "Unable to link kit.")),
                          );
                      }}
                    />
                    <Actions>
                      <Action title="Edit club" onPress={() => edit(value)} />
                      {person?.role === "admin" && <Action
                        tone="danger"
                        title="Delete club"
                        disabled={busy}
                        onPress={() => { void beginDeletion(value); }}
                      />}
                    </Actions>
                  </>
                )}
              </>
            )}
          </Card>
        );
      })}
      {staff && (
        <Modal
          transparent
          visible={formOpen}
          animationType="fade"
          onRequestClose={requestClose}
          accessibilityLabel={isNew ? "Add shared club" : "Edit shared club"}
        >
          {formOpen && draft ? (
            <KeyboardAvoidingView
              style={modalStyles.backdrop}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <Pressable
                accessibilityLabel="Close club editor"
                style={StyleSheet.absoluteFill}
                onPress={requestClose}
              />
              <View style={modalStyles.dialog}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={modalStyles.content}
                >
                  <View style={modalStyles.header}>
                    <Label>
                      {isNew
                        ? "Add shared club"
                        : draft.club.name || "Edit shared club"}
                    </Label>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      onPress={requestClose}
                      style={modalStyles.close}
                    >
                      <Text style={modalStyles.closeText}>✕</Text>
                    </Pressable>
                  </View>
                  {message ? <Note>{message}</Note> : null}
                  {discardPrompt && (
                    <Card>
                      <Label>Discard unsaved club?</Label>
                      <Note>This new club has not been created yet.</Note>
                      <Actions>
                        <Action
                          tone="danger"
                          title="Discard"
                          onPress={discardNewClub}
                        />
                        <Action
                          title="Keep editing"
                          onPress={() => {
                            setDiscardPrompt(false);
                          }}
                        />
                      </Actions>
                    </Card>
                  )}
                  <Fold
                    title="Details"
                    summary={`${cadenceLabel(draft.club.cadence)} · ${meetingRuleLabel(draft.club)} · ${draft.club.pickup}`}
                    open={open.details}
                    onToggle={() => toggleSection("details")}
                  >
                    <Field
                      label="Club name"
                      value={draft.club.name}
                      onChangeText={(name) => changeDetails({ name })}
                    />
                    <Field
                      label="Branch"
                      value={draft.club.branch}
                      onChangeText={(branch) => changeDetails({ branch })}
                    />
                    <Field
                      label="Club size"
                      value={draft.sizeText}
                      onChangeText={(text) => changeDetails({}, text)}
                    />
                    <Label>Meeting cadence</Label>
                    <Actions>
                      <Action title="Monthly" selected={draft.club.cadence === 1} onPress={() => changeDetails({ cadence: 1 })} />
                      <Action title="Six weeks" selected={draft.club.cadence === 1.5} onPress={() => changeDetails({ cadence: 1.5 })} />
                    </Actions>
                    <Note>Six weeks schedules two months, then skips one, starting with the cycle&apos;s first month. It does not calculate exact six-week meeting dates.</Note>
                    <Label>Meeting occurrence</Label>
                    <Actions>{meetingOccurrences.map(({ value, label }) => <Action key={value} title={label} selected={draft.club.meetingOccurrence === value} onPress={() => changeDetails({ meetingOccurrence: value })} />)}</Actions>
                    <Label>Meeting weekday</Label>
                    <Actions>{meetingWeekdays.map(({ value, label }) => <Action key={value} title={label} selected={draft.club.meetingWeekday === value} onPress={() => changeDetails({ meetingWeekday: value })} />)}</Actions>
                    <Note>Undated meetings use {meetingRuleLabel(draft.club)}. Changing this rule alone does not move dated meetings. Full schedule generation replaces shown clubs&apos; dates after confirmation.</Note>
                    <Action
                      title={`Method: ${draft.club.pickup}`}
                      onPress={() =>
                        changeDetails({
                          pickup:
                            draft.club.pickup === "pickup"
                              ? "delivery"
                              : "pickup",
                        })
                      }
                    />
                    {draft.club.pickup === "delivery" && (
                      <Field
                        label="Fictional delivery address"
                        value={draft.club.address}
                        onChangeText={(address) => changeDetails({ address })}
                      />
                    )}
                    {isNew ? (
                      <Actions>
                        <Action
                          tone="primary"
                          title="Create club"
                          onPress={createClub}
                        />
                      </Actions>
                    ) : (
                      <SyncLine
                        state={status.details}
                        onRetry={() => void retry("details")}
                        onRevert={() => void revert("details")}
                      />
                    )}
                  </Fold>
                  {isNew ? (
                    <Note>
                      Create the club to manage members and reading history.
                    </Note>
                  ) : (
                    <>
                      <Fold
                        title="Members"
                        summary={`${draft.members.length} selected`}
                        open={open.members}
                        onToggle={() => toggleSection("members")}
                      >
                        <Note>
                          One leader per club. Memberships with saved ballots
                          cannot be removed.
                        </Note>
                        {data.people.length === 0 && (
                          <Note>Create demo users on the Admin tab first.</Note>
                        )}
                        <TextInput
                          value={memberQuery}
                          onChangeText={setMemberQuery}
                          placeholder="Search people"
                          style={uiStyles.input}
                        />
                        <Actions>
                          <Action
                            selected={memberSelectedOnly}
                            title="Selected only"
                            onPress={() =>
                              setMemberSelectedOnly(!memberSelectedOnly)
                            }
                          />
                        </Actions>
                        <Actions>
                          {memberRows.map((candidate) => {
                            const membership = draft.members.find(
                              (member) => member.personId === candidate.id,
                            );
                            return (
                              <View key={candidate.id} style={modalStyles.chip}>
                                <View style={modalStyles.grow}>
                                  <Action
                                    selected={!!membership}
                                    title={`${membership ? "✓ " : ""}${candidate.name} (${candidate.role})`}
                                    onPress={() => toggleMember(candidate.id)}
                                  />
                                </View>
                                {membership && (
                                  <View style={modalStyles.grow}>
                                    <Action
                                      selected={membership.leader}
                                      title={
                                        membership.leader
                                          ? "Leader ✓"
                                          : "Make leader"
                                      }
                                      onPress={() => toggleLeader(candidate.id)}
                                    />
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </Actions>
                        {memberRows.length === 0 && (
                          <Note>No matching people.</Note>
                        )}
                        <SyncLine
                          state={status.members}
                          onRetry={() => void retry("members")}
                          onRevert={() => void revert("members")}
                        />
                      </Fold>
                      <Fold
                        title="Reading history"
                        summary={`${draft.history.length} read`}
                        open={open.history}
                        onToggle={() => toggleSection("history")}
                      >
                        <TextInput
                          value={titleQuery}
                          onChangeText={setTitleQuery}
                          placeholder="Search titles"
                          style={uiStyles.input}
                        />
                        <Actions>
                          <Action
                            selected={titleSelectedOnly}
                            title="Selected only"
                            onPress={() =>
                              setTitleSelectedOnly(!titleSelectedOnly)
                            }
                          />
                        </Actions>
                        <Actions>
                          {titleRows.map((title) => {
                            const read = draft.history.includes(title.id);
                            return (
                              <View key={title.id} style={modalStyles.chip}>
                                <TitleCover
                                  coverUrl={title.coverUrl}
                                  isbn={title.isbn}
                                  style={modalStyles.thumb}
                                />
                                <View style={modalStyles.grow}>
                                  <Action
                                    selected={read}
                                    title={`${read ? "✓ " : ""}${title.name}`}
                                    onPress={() => toggleTitle(title.id)}
                                  />
                                </View>
                              </View>
                            );
                          })}
                        </Actions>
                        {titleRows.length === 0 && (
                          <Note>No matching titles.</Note>
                        )}
                        <SyncLine
                          state={status.history}
                          onRetry={() => void retry("history")}
                          onRevert={() => void revert("history")}
                        />
                      </Fold>
                    </>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </Modal>
      )}
      {message && !formOpen ? <Text>{message}</Text> : null}
    </Page>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "90%",
    backgroundColor: "#fffefa",
  },
  content: { padding: 16, gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 22 },
  fold: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8d2c4",
    borderRadius: 6,
  },
  foldHeader: {
    minHeight: 44,
    padding: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  foldTitle: { fontWeight: "600" },
  foldSummary: { color: "#666" },
  foldBody: { padding: 10, paddingTop: 0, gap: 8 },
  sync: { gap: 6 },
  syncText: { color: "#555" },
  syncError: { color: "#a33" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexBasis: 240,
    flexGrow: 1,
  },
  grow: { flex: 1 },
  thumb: { width: 34, height: 50 },
});
