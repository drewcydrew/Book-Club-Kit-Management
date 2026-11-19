import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePreventRemove } from "expo-router";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Action, Actions, Card, Label, Note } from "./ui";
import { RankingList } from "./ranking-list";
import { TitleDetails } from "./title-details";
import { TitleGallery } from "./title-gallery";
import { galleryColumns } from "./gallery-columns";
import { ballotKey, emptyBallot, moveInRanking, setMark, undoDismissal } from "../domain/ballot-draft";
import { titleLabelSummary } from "../domain/kit-label-search";
import { rankings } from "../domain/logic";
import type { Ballot, Club, Cycle, Data, Mark, Person } from "../domain/model";
import { finalizeRanking, loadLeaderReview, saveBallot } from "../state/api";
import { useBallotSync } from "../state/ballot-sync";
import { reconcileBallot, saveStagedBallots, stageBallot, type StagedBallot } from "../state/staged-ballots";
import { useShared } from "../state/shared";
import { useNavigationGuard } from "./navigation-guard";

function moved(list: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Compact notice that fades in; used for undoable removals.
function Toast({ children }: { children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
  }, [opacity]);
  return <Animated.View style={[styles.toast, { opacity }]}>{children}</Animated.View>;
}

export const syncMessages = {
  idle: "Choices apply immediately on this device and sync in the background.",
  saving: "Saving in the background…",
  saved: "All choices are saved.",
};

export function useMemberPreferences({ data, shared, person, cycle, club, isMember, isLeader, editable }: {
  data: Data; shared: ReturnType<typeof useShared>; person: Person | undefined;
  cycle: Cycle | undefined; club: Club | undefined; isMember: boolean; isLeader: boolean; editable: boolean;
}) {
  const [review, setReview] = useState<{ key: string; ranking: string[] } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Ballot>>({});
  const draftRef = useRef<Record<string, Ballot>>({});
  const [mode, setMode] = useState<'auto' | 'draft'>('auto');
  const [staged, setStaged] = useState<Record<string, StagedBallot>>({});
  const stagedRef = useRef<Record<string, StagedBallot>>({});
  const [draftSaving, setDraftSaving] = useState(false);
  const draftSavingRef = useRef(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftAction, setDraftAction] = useState<'autosave' | 'discard' | null>(null);
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const [syncRefreshError, setSyncRefreshError] = useState<string | null>(null);
  const refreshCount = useRef(0);
  const refreshSequence = useRef(0);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderFinalizing, setLeaderFinalizing] = useState(false);
  const leaderFinalizingRef = useRef(false);
  const [leaderResult, setLeaderResult] = useState<{ key: string; ballots: Ballot[]; error: null } | { key: string; ballots: null; error: string } | null>(null);
  const [leaderRetry, setLeaderRetry] = useState(0);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [allowLeaving, setAllowLeaving] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState("");
  const navigationGuard = useNavigationGuard();
  const [dismissalUndo, setDismissalUndo] = useState<{ key: string; titleId: string; dismissedAs: 'wont' | 'read'; previous: Mark | null; index: number } | null>(null);
  const [lastRemovedId, setLastRemovedId] = useState<string | null>(null);
  const [detailTitleId, setDetailTitleId] = useState<string | null>(null);
  const sync = useBallotSync(
    saveBallot,
    () => {
      const saved = draftRef.current;
      shared.invalidateOtherScopes();
      const request = ++refreshSequence.current;
      refreshCount.current += 1;
      setSyncRefreshing(true);
      void shared.refresh().then(() => {
        if (request === refreshSequence.current) setSyncRefreshError(null);
        const remaining = { ...draftRef.current };
        for (const [key, value] of Object.entries(saved)) {
          if (remaining[key] === value) delete remaining[key];
        }
        draftRef.current = remaining;
        setDrafts(remaining);
      }).catch((error: unknown) => {
        if (request === refreshSequence.current) setSyncRefreshError(error instanceof Error ? error.message : "Unable to refresh saved choices.");
      }).finally(() => {
        refreshCount.current -= 1;
        if (refreshCount.current === 0) { setSyncRefreshing(false); shared.setBackgroundSaving(false); }
      });
    },
    () => { shared.invalidateOtherScopes(); shared.setBackgroundSaving(false); },
  );

  const serverBallot =
    cycle && club && person
      ? data.ballots.find(
          (b) =>
            b.cycleId === cycle.id &&
            b.clubId === club.id &&
            b.personId === person.id,
        )
      : undefined;
  const currentKey =
    cycle && club && person
      ? ballotKey({ cycleId: cycle.id, clubId: club.id, personId: person.id })
      : "";
  const ballot = staged[currentKey]?.ballot ?? drafts[currentKey] ?? serverBallot;
  const reviewKey = `${cycle?.id ?? ""}:${club?.id ?? ""}:${person?.id ?? ""}`;
  const reviewRanking = review?.key === reviewKey ? review.ranking : null;
  const leaderKey = `${reviewKey}:${cycle?.revision ?? ""}:${leaderRetry}`;
  const leaderReady = leaderResult?.key === leaderKey && leaderResult.ballots !== null;
  const leaderError = leaderResult?.key === leaderKey ? leaderResult.error : null;
  const reviewData = leaderReady ? { ...data, ballots: leaderResult.ballots } : data;
  const personId = person?.id;
  const clubId = club?.id;
  const cycleId = cycle?.id;
  useEffect(() => {
    if (!leaderOpen || !isLeader || !personId || !clubId || !cycleId) return;
    const controller = new AbortController();
    void loadLeaderReview(personId, clubId, cycleId, controller.signal).then((ballots) => {
      if (!controller.signal.aborted) setLeaderResult({ key: leaderKey, ballots, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLeaderResult({ key: leaderKey, ballots: null, error: error instanceof Error ? error.message : "Unable to load club rankings." });
    });
    return () => controller.abort();
  }, [leaderOpen, isLeader, personId, clubId, cycleId, leaderKey]);
  const stagedCount = Object.keys(staged).length;
  const busy = sync.status.state === "saving" || syncRefreshing || shared.saving || draftSaving;
  const dirty = sync.status.state === "error" || !!syncRefreshError || reviewRanking !== null || stagedCount > 0;
  const disablePrevention = usePreventRemove(!allowLeaving && (busy || dirty), ({ repeat }) => {
    if (busy) { setNavigationMessage("Wait for choices and shared changes to finish saving before leaving."); return; }
    setPendingNavigation(() => repeat);
  });
  useEffect(() => {
    if (!busy && !dirty) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) { setNavigationMessage("Wait for choices and shared changes to finish saving before leaving."); return; }
      setPendingNavigation(() => () => { disablePrevention(); continueNavigation(); });
    });
  }, [busy, dirty, disablePrevention, navigationGuard]);
  useEffect(() => {
    if (Platform.OS !== 'web' || (!busy && !dirty)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, dirty]);
  const clubRead = club
    ? data.titles.filter((title) => club.history.includes(title.id))
    : [];
  const detailTitle = data.titles.find((title) => title.id === detailTitleId);
  const labelById = useMemo(() => new Map(data.kitLabels.map((label) => [label.id, label])), [data.kitLabels]);
  const activeUndo = dismissalUndo?.key === currentKey && ballot?.marks[dismissalUndo.titleId] === dismissalUndo.dismissedAs ? dismissalUndo : null;
  const selectedCount = Object.values(ballot?.marks ?? {}).filter(
    (value) => value === "selected",
  ).length;

  // Revisions come from the server's copy when it is newer than the draft's, so retries are not rejected as conflicts.
  function withFreshRevision(value: Ballot): Ballot {
    return {
      ...value,
      revision: Math.max(value.revision, serverBallot?.revision ?? 0),
    };
  }

  function changeBallot(fn: (current: Ballot) => Ballot) {
    if (!club || !cycle || !person || !editable || !isMember || draftSavingRef.current || leaderFinalizingRef.current || stagedRef.current[currentKey]?.issue) return;
    const latest = stagedRef.current[currentKey]?.ballot ?? draftRef.current[currentKey] ?? ballot;
    const current = latest ?? emptyBallot(cycle.id, club.id, person.id);
    const next = fn(current);
    if (mode === 'draft') {
      const baseline = serverBallot ?? emptyBallot(cycle.id, club.id, person.id);
      const updated = stageBallot(stagedRef.current, next, baseline);
      stagedRef.current = updated;
      setStaged(updated);
      setDraftMessage('');
      setReview(null);
      return;
    }
    draftRef.current = { ...draftRef.current, [currentKey]: next };
    setDrafts(draftRef.current);
    setReview(null);

    shared.setBackgroundSaving(true);
    sync.enqueue(withFreshRevision(next));
  }

  function updateStaged(next: Record<string, StagedBallot>) {
    stagedRef.current = next;
    setStaged(next);
  }

  function draftName(value: Ballot) {
    const clubName = data.clubs.find((item) => item.id === value.clubId)?.name ?? value.clubId;
    const cycleName = data.cycles.find((item) => item.id === value.cycleId)?.name ?? value.cycleId;
    return `${clubName} · ${cycleName}`;
  }

  async function saveStaged(keys: string[], switchToAuto: boolean) {
    if (draftSavingRef.current) return;
    draftSavingRef.current = true;
    setDraftSaving(true);
    shared.setBackgroundSaving(true);
    setDraftMessage('');
    try {
      const { savedCount, problem } = await saveStagedBallots(
        keys, () => stagedRef.current, updateStaged, saveBallot, shared.refresh,
      );
      if (problem) {
        shared.invalidateOtherScopes();
        setDraftMessage(`${draftName(problem.ballot)}: ${problem.issue} ${savedCount} drafts saved.`);
        return;
      }
      if (switchToAuto && Object.keys(stagedRef.current).length === 0) setMode('auto');
      setDraftMessage(`${savedCount} ${savedCount === 1 ? 'draft' : 'drafts'} saved.`);
    } finally {
      draftSavingRef.current = false;
      setDraftSaving(false);
      shared.setBackgroundSaving(false);
    }
  }

  async function reconcileDraft() {
    const entry = stagedRef.current[currentKey];
    if (!entry || draftSavingRef.current) return;
    draftSavingRef.current = true;
    setDraftSaving(true);
    shared.setBackgroundSaving(true);
    try {
      const refreshed = await shared.refresh();
      const latest = refreshed.ballots.find((item) => ballotKey(item) === currentKey)
        ?? emptyBallot(entry.ballot.cycleId, entry.ballot.clubId, entry.ballot.personId);
      const result = reconcileBallot(entry, latest);
      if (result === 'saved') {
        const remaining = { ...stagedRef.current };
        delete remaining[currentKey];
        updateStaged(remaining);
        setDraftMessage('The shared ballot matches your draft; no further save is needed.');
      } else if (result === 'retry') {
        updateStaged({ ...stagedRef.current, [currentKey]: { ...entry, issue: undefined } });
        setDraftMessage('The shared ballot has not changed. You can retry saving your draft.');
      } else {
        const issue = 'The shared ballot changed. Your draft is retained; discard it to view the shared choices and make your changes again.';
        updateStaged({ ...stagedRef.current, [currentKey]: { ...entry, issue } });
        setDraftMessage(issue);
      }
    } catch (reason: unknown) {
      setDraftMessage(`Unable to refresh: ${reason instanceof Error ? reason.message : 'Please try again.'}`);
    } finally {
      draftSavingRef.current = false;
      setDraftSaving(false);
      shared.setBackgroundSaving(false);
    }
  }

  async function discardStaged(keys: string[], switchToAuto: boolean) {
    if (draftSavingRef.current) return;
    draftSavingRef.current = true;
    setDraftSaving(true);
    shared.setBackgroundSaving(true);
    try {
      if (keys.some((key) => stagedRef.current[key]?.issue)) {
        await shared.refresh();
      }
      const remaining = { ...stagedRef.current };
      for (const key of keys) delete remaining[key];
      updateStaged(remaining);
      setDismissalUndo(null);
      setLastRemovedId(null);
      setDraftMessage('Draft changes discarded.');
      if (switchToAuto && Object.keys(remaining).length === 0) setMode('auto');
    } catch (reason: unknown) {
      setDraftMessage(`Unable to refresh before discarding: ${reason instanceof Error ? reason.message : 'Please try again.'}`);
    } finally {
      draftSavingRef.current = false;
      setDraftSaving(false);
      shared.setBackgroundSaving(false);
    }
  }

  function requestMode(next: 'auto' | 'draft') {
    if (busy || sync.status.state === 'error' || syncRefreshError) return;
    if (next === 'auto' && stagedCount) setDraftAction('autosave');
    else { setMode(next); setDraftMessage(''); }
  }

  function saveChoices() {
    if (mode === 'draft') { void saveStaged([currentKey], false); return; }
    shared.setBackgroundSaving(true);
    const failedKey = sync.status.key;
    if (sync.status.state === "error" && failedKey && drafts[failedKey]) {
      const failedDraft = drafts[failedKey];
      const latest = data.ballots.find((item) => ballotKey(item) === failedKey);
      sync.enqueue({ ...failedDraft, revision: Math.max(failedDraft.revision, latest?.revision ?? 0) });
    }
    sync.flush().catch(() => undefined);
  }

  function refreshChoices() {
    const request = ++refreshSequence.current;
    const saved = sync.status.state === "saved" ? draftRef.current : null;
    void shared.refresh().then(() => {
      if (request === refreshSequence.current) setSyncRefreshError(null);
      if (saved) {
        const remaining = { ...draftRef.current };
        for (const [key, value] of Object.entries(saved)) {
          if (remaining[key] === value) delete remaining[key];
        }
        draftRef.current = remaining;
        setDrafts(remaining);
      }
    }).catch((error: unknown) => { if (request === refreshSequence.current) setSyncRefreshError(error instanceof Error ? error.message : "Unable to refresh choices."); });
  }

  function mark(titleId: string, value: Mark | null) {
    if (!club || !cycle || !person || !editable || !isMember) return;
    changeBallot((current) => {
      if (value === "wont" || value === "read") {
        setDismissalUndo({ key: currentKey, titleId, dismissedAs: value, previous: current.marks[titleId] ?? null, index: current.ranking.indexOf(titleId) });
        setLastRemovedId(null);
      } else {
        setDismissalUndo((undo) => undo?.key === currentKey && undo.titleId === titleId ? null : undo);
      }
      return setMark(current, titleId, value);
    });
  }

  function undoLastDismissal() {
    if (!activeUndo || !editable || !isMember) return;
    const latest = stagedRef.current[currentKey]?.ballot ?? draftRef.current[currentKey] ?? ballot;
    if (!latest || latest.marks[activeUndo.titleId] !== activeUndo.dismissedAs) {
      setDismissalUndo(null);
      return;
    }
    changeBallot((current) => undoDismissal(current, activeUndo.titleId, activeUndo.dismissedAs, activeUndo.previous, activeUndo.index));
    setDismissalUndo(null);
  }

  function removeSelection(titleId: string) {
    mark(titleId, null);
    setLastRemovedId(titleId);
  }

  function resetContext() {
    setReview(null);
    setDismissalUndo(null);
    setLastRemovedId(null);
  }
  return {
    data, shared, cycle, club, isMember, isLeader, editable, ballot, currentKey, reviewKey, reviewRanking, setReview,
    sync, syncRefreshing, syncRefreshError, leaderOpen, setLeaderOpen, leaderReady, leaderError, setLeaderRetry, reviewData,
    pendingNavigation, setPendingNavigation, setAllowLeaving, navigationMessage, setNavigationMessage, activeUndo, undoLastDismissal,
    lastRemovedId, setLastRemovedId, detailTitle, setDetailTitleId, labelById,
    clubRead, selectedCount, changeBallot, saveChoices, refreshChoices, mark, removeSelection, resetContext,
    mode, stagedCount, currentDraft: staged[currentKey], draftSaving, draftMessage, draftAction, setDraftAction,
    requestMode, saveStaged, reconcileDraft, discardStaged, stagedKeys: () => Object.keys(stagedRef.current),
    leaderFinalizing, setLeaderFinalizing, leaderFinalizingRef,
  };
}

export function MemberPreferences({ controller, wide }: { controller: ReturnType<typeof useMemberPreferences>; wide: boolean }) {
  const [rankingWidth, setRankingWidth] = useState(0);
  const [paletteWidth, setPaletteWidth] = useState(0);
  const {
    data, shared, cycle, club, isMember, isLeader, editable, ballot, currentKey, reviewKey, reviewRanking, setReview,
    sync, syncRefreshing, syncRefreshError, leaderOpen, setLeaderOpen, leaderReady, leaderError, setLeaderRetry, reviewData,
    pendingNavigation, setPendingNavigation, setAllowLeaving, navigationMessage, setNavigationMessage, activeUndo, undoLastDismissal,
    lastRemovedId, setLastRemovedId, detailTitle, setDetailTitleId, labelById,
    clubRead, selectedCount, changeBallot, saveChoices, refreshChoices, mark, removeSelection,
    mode, stagedCount, currentDraft, draftSaving, draftMessage, draftAction, setDraftAction,
    requestMode, saveStaged, reconcileDraft, discardStaged,
    leaderFinalizing, setLeaderFinalizing, leaderFinalizingRef,
  } = controller;
  if (!club || !cycle) return null;
  const editingDisabled = !editable || !isMember || draftSaving || leaderFinalizing || !!currentDraft?.issue;
  const rankingPanel = <View key="ranking" style={wide ? styles.column : undefined} onLayout={(event) => setRankingWidth(event.nativeEvent.layout.width)}>
    <Card soft>
      <Label>Your ranked choices · {selectedCount}</Label>
      <Note>{Platform.OS === "web"
        ? "Drag a cover, or use the ← → buttons, to rank your choices. Your first choice is top-left."
        : "Tap a cover to select it, then use ← → to rank your choices. Your first choice is top-left."}</Note>
      <Note>Labels describe titles. Details show the synopsis and title labels.</Note>
      {activeUndo && (
        <Toast>
          <Note>Moved “{data.titles.find((title) => title.id === activeUndo.titleId)?.name ?? "title"}” to {activeUndo.dismissedAs === "read" ? "Already read" : "Won’t read"}.</Note>
          <Action title="Undo" accessibilityLabel="Undo dismissal" disabled={editingDisabled} onPress={undoLastDismissal} />
        </Toast>
      )}
      {lastRemovedId && ballot?.marks[lastRemovedId] === undefined && (
        <Toast>
          <Note>Removed “{data.titles.find((t) => t.id === lastRemovedId)?.name ?? "title"}”.</Note>
          <Action title="Undo" accessibilityLabel="Undo removal" disabled={editingDisabled}
            onPress={() => { setLastRemovedId(null); mark(lastRemovedId, "selected"); }} />
        </Toast>
      )}
      <RankingList key={currentKey} columns={wide && rankingWidth ? galleryColumns(rankingWidth) : undefined}
        items={(ballot?.ranking ?? []).map((titleId) => {
          const title = data.titles.find((t) => t.id === titleId);
          return {
            id: titleId, label: title?.name ?? "Unavailable title", author: title?.author ?? "",
            coverUrl: title?.coverUrl ?? null, isbn: title?.isbn ?? "",
            kitLabels: title ? titleLabelSummary(title, labelById) : "Title unavailable.",
            clubRead: club.history.includes(titleId),
          };
        })}
        disabled={editingDisabled}
        onReorder={(from, to) => changeBallot((current) => moveInRanking(current, from, to))}
        onRemove={removeSelection} onShowDetails={setDetailTitleId} />
      {(ballot?.ranking.length ?? 0) === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No choices yet</Text>
          <Note>{wide ? "Add titles on the left to start your ranking." : "Add titles below to start your ranking."}</Note>
        </View>
      )}
      {!isMember && <Note>Only a user assigned to this club can submit preferences for it.</Note>}
    </Card>
  </View>;
  const palettePanel = <View key="palette" style={wide ? styles.column : undefined} onLayout={(event) => setPaletteWidth(event.nativeEvent.layout.width)}>
    <Card soft>
      {data.titles.length === 0 ? <Note>No shared titles are available. Staff can add titles in the Catalog.</Note> :
        <TitleGallery titles={data.titles.filter((title) => !club.history.includes(title.id))}
          labels={data.kitLabels} marks={ballot?.marks ?? {}} disabled={editingDisabled}
          columns={wide && paletteWidth ? galleryColumns(paletteWidth) : undefined}
          onMark={mark} onShowDetails={setDetailTitleId} />}
      {clubRead.length > 0 && <Note>{clubRead.length} {clubRead.length === 1 ? "title" : "titles"} already read by this club {clubRead.length === 1 ? "is" : "are"} hidden from the palette.</Note>}
      {clubRead.filter((title) => ballot?.marks[title.id]).map((title) => <Actions key={title.id}>
        <Text>{title.name}: existing mark {ballot?.marks[title.id]}</Text>
        <Action title="Clear existing mark" disabled={editingDisabled} onPress={() => mark(title.id, null)} />
      </Actions>)}
    </Card>
  </View>;
  return (
    <>
      {navigationMessage ? <Text accessibilityLiveRegion="polite" onPress={() => setNavigationMessage("")}>{navigationMessage}</Text> : null}
      <Modal transparent visible={!!pendingNavigation} onRequestClose={() => setPendingNavigation(null)} accessibilityLabel="Discard unsaved choices">
        <View style={styles.backdrop}><View style={styles.dialog}>
          <Label>Discard unsaved changes?</Label>
          <Note>Unsaved choices or ranking changes will be lost. Changes already saved on the server remain.</Note>
          <Actions><Action tone="danger" title="Discard and leave" onPress={() => { const next = pendingNavigation; setAllowLeaving(true); setPendingNavigation(null); next?.(); }} />
            <Action title="Keep editing" onPress={() => setPendingNavigation(null)} /></Actions>
        </View></View>
      </Modal>
      <Modal transparent visible={!!draftAction} onRequestClose={() => setDraftAction(null)} accessibilityLabel="Resolve draft changes">
        <View style={styles.backdrop}><View style={styles.dialog}>
          <Label>{draftAction === 'autosave' ? 'Switch to autosave?' : 'Discard this draft?'}</Label>
          <Note>{draftAction === 'autosave'
            ? `${stagedCount} unsaved ${stagedCount === 1 ? 'draft' : 'drafts'} across your clubs and cycles. Save all or discard all before switching.`
            : 'Your local changes for this club and cycle will be lost.'}</Note>
          <Actions>
            {draftAction === 'autosave' && <Action title="Save all" tone="primary" onPress={() => {
              setDraftAction(null); void saveStaged(controller.stagedKeys(), true);
            }} />}
            <Action tone="danger" title={draftAction === 'autosave' ? 'Discard all' : 'Discard draft'} onPress={() => {
              const all = draftAction === 'autosave';
              setDraftAction(null); void discardStaged(all ? controller.stagedKeys() : [currentKey], all);
            }} />
            <Action title="Cancel" onPress={() => setDraftAction(null)} />
          </Actions>
        </View></View>
      </Modal>
      {detailTitle && (
        <TitleDetails title={detailTitle} labels={data.kitLabels} onClose={() => setDetailTitleId(null)} />
      )}
      <Card soft>
        <Label>Save mode</Label>
        <Actions>
          <Action title="Autosave" selected={mode === 'auto'} disabled={shared.saving || sync.status.state === 'saving' || syncRefreshing || sync.status.state === 'error' || !!syncRefreshError} onPress={() => requestMode('auto')} />
          <Action title="Draft" selected={mode === 'draft'} disabled={shared.saving || sync.status.state === 'saving' || syncRefreshing || sync.status.state === 'error' || !!syncRefreshError} onPress={() => requestMode('draft')} />
        </Actions>
        <Note>{mode === 'auto' ? 'Changes save automatically.' : `Changes remain on this device until saved. ${stagedCount} unsaved ${stagedCount === 1 ? 'draft' : 'drafts'} across clubs and cycles.`}</Note>
        {draftMessage ? <Text accessibilityLiveRegion="polite">{draftMessage}</Text> : null}
      </Card>
      <View style={wide ? styles.columns : styles.stacked}>
        {wide ? [palettePanel, rankingPanel] : [rankingPanel, palettePanel]}
      </View>
      <Card soft>
        <Label>Save choices</Label>
        {(syncRefreshError || sync.status.state === "error") && (
          <Note>
            {syncRefreshError ? `Unable to refresh choices: ${syncRefreshError}` : sync.status.state === "error" ? sync.status.message : ""}
          </Note>
        )}
        <Actions>
          <Action
            tone="primary"
            title={mode === 'draft' ? 'Save current draft' : sync.status.state === "error" ? "Retry saving" : "Save choices now"}
            disabled={
              draftSaving || sync.status.state === "saving" || syncRefreshing ||
              (mode === 'draft' ? !currentDraft || !!currentDraft.issue || !editable || !isMember :
                sync.status.state !== "error" && (!editable || !isMember))
            }
            onPress={saveChoices}
          />
          {mode === 'draft' && currentDraft && <Action title="Discard current draft" disabled={draftSaving} onPress={() => setDraftAction('discard')} />}
          {mode === 'draft' && currentDraft?.issue && <Action title="Refresh to reconcile" disabled={draftSaving} onPress={() => { void reconcileDraft(); }} />}
          {mode === 'auto' && (sync.status.state === "error" || syncRefreshError) && (
            <Action
              title="Refresh"
              disabled={syncRefreshing}
              onPress={refreshChoices}
            />
          )}
        </Actions>
        {mode === 'draft' && currentDraft?.issue && <Note>{currentDraft.issue}</Note>}
      </Card>
      {isLeader && (
        <Card soft>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: leaderOpen }} onPress={() => setLeaderOpen(!leaderOpen)} style={styles.panelHeader}>
            <Label>{leaderOpen ? "▾" : "▸"} Leader review · {club.name}</Label>
            <Note>{Object.prototype.hasOwnProperty.call(cycle.finalized, club.id) ? "Finalized" : "Not finalized"}</Note>
          </Pressable>
          {leaderOpen && <>
          {leaderError ? <><Text>{leaderError}</Text><Action title="Retry club rankings" onPress={() => setLeaderRetry((value) => value + 1)} /></> :
          !leaderReady ? <Note>Loading club rankings...</Note> : <>
          <Note>
            Member rankings are combined using points for each ranked
            position. Ties are resolved by title ID. Finalizing saves a
            shared club ordering; any ballot change invalidates it.
          </Note>
          {(
            reviewRanking ??
            cycle.finalized[club.id] ??
            rankings(reviewData, cycle, club.id)
          ).map((titleId, index, list) => (
            <Actions key={titleId}>
              <Text>
                {index + 1}.{" "}
                {data.titles.find((t) => t.id === titleId)?.name ??
                  "Unavailable title"}
              </Text>
              <Action
                title="↑"
                accessibilityLabel={`Move ${data.titles.find((t) => t.id === titleId)?.name ?? "unavailable title"} up`}
                disabled={!editable || shared.saving || index === 0}
                onPress={() =>
                  setReview({
                    key: reviewKey,
                    ranking: moved(list, index, -1),
                  })
                }
              />
              <Action
                title="↓"
                accessibilityLabel={`Move ${data.titles.find((t) => t.id === titleId)?.name ?? "unavailable title"} down`}
                disabled={
                  !editable || shared.saving || index === list.length - 1
                }
                onPress={() =>
                  setReview({
                    key: reviewKey,
                    ranking: moved(list, index, 1),
                  })
                }
              />
            </Actions>
          ))}
          <Action
            tone="primary"
            title="Finalize club ranking"
            disabled={!editable || shared.saving || syncRefreshing || !!syncRefreshError || sync.status.state === "saving" || sync.status.state === "error" || !!shared.error || !!currentDraft || draftSaving}
            onPress={() => {
              if (leaderFinalizingRef.current) return;
              leaderFinalizingRef.current = true;
              setLeaderFinalizing(true);
              const order =
                reviewRanking ??
                cycle.finalized[club.id] ??
                rankings(reviewData, cycle, club.id);
              void shared
                .mutate(() =>
                  finalizeRanking(cycle.id, club.id, order, cycle.revision),
                )
                .then(() => setReview(null))
                .catch(() => undefined)
                .finally(() => { leaderFinalizingRef.current = false; setLeaderFinalizing(false); });
            }}
          />
          {!editable && (
            <Note>
              Leader review is available only while preferences are open.
            </Note>
          )}
          {editable && (syncRefreshing || syncRefreshError || sync.status.state === "saving" || sync.status.state === "error") && (
            <Note>Save all choices and refresh successfully before finalizing.</Note>
          )}
          {editable && currentDraft && <Note>Save or discard this club and cycle&apos;s draft before finalizing.</Note>}
          </>}
          </>}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  stacked: { gap: 18 },
  column: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: "#fffefa", padding: 20, gap: 12, maxWidth: 600, width: "100%", alignSelf: "center" },
  panelHeader: { gap: 4 },
  toast: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, backgroundColor: "#eef5ef" },
  empty: { alignItems: "center", gap: 4, padding: 24, borderWidth: 1, borderStyle: "dashed", borderColor: "#9db8ac", borderRadius: 10, backgroundColor: "#f7fbf7" },
  emptyTitle: { fontWeight: "700", color: "#183a36", fontSize: 16 },
});
