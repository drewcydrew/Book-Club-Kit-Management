import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import { Action, Actions, Card, Label, Note, Page } from "../components/ui";
import { PriorityGridView } from "../components/priority-grid";
import { SCHEDULE_DESKTOP_WIDTH } from "../components/schedule-layout";
import { RankingList } from "../components/ranking-list";
import { TitleGallery } from "../components/title-gallery";
import {
  ballotKey,
  emptyBallot,
  moveInRanking,
  setMark,
} from "../domain/ballot-draft";
import { priorityMatrix, titleDemand } from "../domain/cycle-overview";
import { today } from "../domain/dates";
import { finalizeRanking, saveBallot } from "../state/api";
import { useBallotSync } from "../state/ballot-sync";
import { preferences as clubPreferences, rankings } from "../domain/logic";
import type { Ballot, Mark } from "../domain/model";
import { useShared } from "../state/shared";
import { useStore } from "../state/store";

function moved(list: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const syncMessages = {
  idle: "Choices apply immediately on this device and sync in the background.",
  saving: "Saving in the background…",
  saved: "All choices are saved.",
};

export default function Preferences() {
  const { width } = useWindowDimensions();
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? "");
  const [clubId, setClubId] = useState("");
  const [review, setReview] = useState<{
    key: string;
    ranking: string[];
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Ballot>>({});
  const draftRef = useRef<Record<string, Ballot>>({});
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const [syncRefreshError, setSyncRefreshError] = useState<string | null>(null);
  const refreshCount = useRef(0);
  const [titlesOpen, setTitlesOpen] = useState(true);
  const [rankingOpen, setRankingOpen] = useState(true);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const [lastDismissedId, setLastDismissedId] = useState<string | null>(null);
  const [reviewClubIds, setReviewClubIds] = useState<string[] | null>(null);
  const sync = useBallotSync(
    saveBallot,
    () => {
      const saved = draftRef.current;
      refreshCount.current += 1;
      setSyncRefreshing(true);
      void shared.refresh().then(() => {
        setSyncRefreshError(null);
        const remaining = { ...draftRef.current };
        for (const [key, value] of Object.entries(saved)) {
          if (remaining[key] === value) delete remaining[key];
        }
        draftRef.current = remaining;
        setDrafts(remaining);
      }).catch((error: unknown) => {
        setSyncRefreshError(error instanceof Error ? error.message : "Unable to refresh saved choices.");
      }).finally(() => {
        refreshCount.current -= 1;
        if (refreshCount.current === 0) setSyncRefreshing(false);
      });
    },
  );
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
  const wide = staff && Platform.OS === "web" && width >= SCHEDULE_DESKTOP_WIDTH;
  const isMember = !!person && !!club && membershipClubs.includes(club.id);
  const isLeader =
    !!person &&
    data.memberships.some(
      (membership) =>
        membership.personId === person.id &&
        membership.clubId === club?.id &&
        membership.leader,
    );
  const editable =
    !!cycle && cycle.status === "collecting" && today() <= cycle.deadline;
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
  const ballot = drafts[currentKey] ?? serverBallot;
  const reviewKey = `${cycle?.id ?? ""}:${club?.id ?? ""}:${person?.id ?? ""}`;
  const reviewRanking = review?.key === reviewKey ? review.ranking : null;
  const clubRead = club
    ? data.titles.filter((title) => club.history.includes(title.id))
    : [];
  const selectedCount = Object.values(ballot?.marks ?? {}).filter(
    (value) => value === "selected",
  ).length;

  const shownClubIds = availableClubs
    .filter((value) => reviewClubIds === null || reviewClubIds.includes(value.id))
    .map((value) => value.id);
  const demand = titleDemand(data, cycle?.id ?? "", shownClubIds);

  function chooseClub(value: string) {
    setReview(null);
    setLastDismissedId(null);
    setClubId(value);
    setClubOpen(false);
  }

  // Revisions come from the server's copy when it is newer than the draft's, so retries are not rejected as conflicts.
  function withFreshRevision(value: Ballot): Ballot {
    return {
      ...value,
      revision: Math.max(value.revision, serverBallot?.revision ?? 0),
    };
  }

  function changeBallot(fn: (current: Ballot) => Ballot) {
    if (!club || !cycle || !person || !editable || !isMember) return;
    const latest = draftRef.current[currentKey] ?? ballot;
    const current = latest ?? emptyBallot(cycle.id, club.id, person.id);
    const next = fn(current);
    draftRef.current = { ...draftRef.current, [currentKey]: next };
    setDrafts(draftRef.current);
    setReview(null);

    sync.enqueue(withFreshRevision(next));
  }

  function saveChoices() {
    const failedKey = sync.status.key;
    if (sync.status.state === "error" && failedKey && drafts[failedKey]) {
      const failedDraft = drafts[failedKey];
      const latest = data.ballots.find((item) => ballotKey(item) === failedKey);
      sync.enqueue({ ...failedDraft, revision: Math.max(failedDraft.revision, latest?.revision ?? 0) });
    }
    sync.flush().catch(() => undefined);
  }

  function refreshChoices() {
    const saved = sync.status.state === "saved" ? draftRef.current : null;
    void shared.refresh().then(() => {
      setSyncRefreshError(null);
      if (saved) {
        const remaining = { ...draftRef.current };
        for (const [key, value] of Object.entries(saved)) {
          if (remaining[key] === value) delete remaining[key];
        }
        draftRef.current = remaining;
        setDrafts(remaining);
      }
    }).catch((error: unknown) => setSyncRefreshError(error instanceof Error ? error.message : "Unable to refresh choices."));
  }

  function mark(titleId: string, value: Mark | null) {
    setLastDismissedId(value === "wont" ? titleId : null);
    changeBallot((current) => setMark(current, titleId, value));
  }

  if (!person)
    return (
      <Page title="Preferences" wide={wide}>
        <Note>
          No demo user is selected on this device. Choose a shared user on the
          User tab; no user is selected automatically.
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
      <Card>
        <Label>{cycle.name}{club && !staff ? ` · ${club.name}` : ""}</Label>
        <Note>
          Status: {cycle.status} · Deadline: {cycle.deadline}. Voting is{" "}
          {editable ? "open" : "closed"}.
        </Note>
        {!staff && club && <Note>
          {syncRefreshError ? `Unable to refresh choices: ${syncRefreshError}` :
            sync.status.state === "error" ? sync.status.message :
            sync.status.state === "saving" ? syncMessages.saving :
              sync.status.state === "saved" ? syncMessages.saved : syncMessages.idle}
        </Note>}
        <Actions>
          {data.cycles.length > 1 && <Action title={cycleOpen ? "Close cycles" : "Change cycle"} onPress={() => setCycleOpen(!cycleOpen)} />}
          {!staff && availableClubs.length > 1 && <Action title={clubOpen ? "Close clubs" : club ? "Change club" : "Choose club"} onPress={() => setClubOpen(!clubOpen)} />}
        </Actions>
        {cycleOpen && <Actions>
          {data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} title={value.name} onPress={() => {
            setSelectedId(value.id);
            setCycleOpen(false);
            setReview(null);
            setLastDismissedId(null);
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
                onPress={() => chooseClub(value.id)}
              />
            ))}
          </Actions>
        </>}
      </Card>
      {person.role === "member" && availableClubs.length === 0 && (
        <Note>
          This user has no club memberships. Staff can add memberships on the
          Clubs page.
        </Note>
      )}
      {person.role === "member" && availableClubs.length > 0 && !club && (
        <Note>
          Choose a club to view this user’s independent preferences. Memberships
          and preferences are shared across devices.
        </Note>
      )}
      {!staff && club && (
        <>
          <Card>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: titlesOpen }}
              onPress={() => setTitlesOpen((value) => !value)}
              style={styles.panelHeader}
            >
              <Label>
                {titlesOpen ? "▾" : "▸"} 1. Choose titles for {club.name}
              </Label>
              <Note>
                {selectedCount} selected · tap to{" "}
                {titlesOpen ? "collapse" : "expand"}
              </Note>
            </Pressable>
            {titlesOpen && (
              <>
                {data.titles.length === 0 && (
                  <Note>
                    No shared titles are available. Staff can add titles in the
                    Catalog.
                  </Note>
                )}
                {data.titles.length > 0 && (
                  <TitleGallery
                    titles={data.titles.filter(
                      (title) => !club.history.includes(title.id),
                    )}
                    marks={ballot?.marks ?? {}}
                    disabled={!editable || !isMember}
                    lastDismissedId={lastDismissedId}
                    onMark={mark}
                  />
                )}
                {clubRead.length > 0 && (
                  <Note>
                    {clubRead.length}{" "}
                    {clubRead.length === 1 ? "title" : "titles"} already read by
                    this club {clubRead.length === 1 ? "is" : "are"} hidden.
                  </Note>
                )}
                {clubRead
                  .filter((title) => ballot?.marks[title.id])
                  .map((title) => (
                    <Actions key={title.id}>
                      <Text>
                        {title.name}: existing mark {ballot?.marks[title.id]}
                      </Text>
                      <Action
                        title="Clear existing mark"
                        disabled={!editable || !isMember}
                        onPress={() => mark(title.id, null)}
                      />
                    </Actions>
                  ))}
                {!isMember && (
                  <Note>
                    Only a user assigned to this club can submit preferences for
                    it.
                  </Note>
                )}
              </>
            )}
          </Card>
          <Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: rankingOpen }} onPress={() => setRankingOpen(!rankingOpen)} style={styles.panelHeader}>
              <Label>{rankingOpen ? "▾" : "▸"} 2. Rank selected titles · {selectedCount}</Label>
            </Pressable>
            {rankingOpen && <>
            <Note>
              Drag ⠿ to move a title, or use the arrows. Each ranking is shared
              for this user, club and cycle.
            </Note>
            <RankingList
              items={(ballot?.ranking ?? []).map((titleId) => {
                const title = data.titles.find((t) => t.id === titleId);
                return {
                  id: titleId,
                  label: title?.name ?? "Unavailable title",
                  coverUrl: title?.coverUrl ?? null,
                  isbn: title?.isbn ?? "",
                };
              })}
              disabled={!editable || !isMember}
              onReorder={(from, to) =>
                changeBallot((current) => moveInRanking(current, from, to))
              }
            />
            {(ballot?.ranking.length ?? 0) === 0 && (
              <Note>No selected titles to rank.</Note>
            )}
            </>}
          </Card>
          <Card>
            <Label>Saving choices · all clubs and cycles</Label>
            <Note>
              {syncRefreshError ? `Unable to refresh choices: ${syncRefreshError}` :
              sync.status.state === "error"
                ? sync.status.message
                : sync.status.state === "saving"
                  ? syncMessages.saving
                  : sync.status.state === "saved"
                    ? syncMessages.saved
                    : syncMessages.idle}
            </Note>
            <Actions>
              <Action
                tone="primary"
                title={sync.status.state === "error" ? "Retry saving" : "Save choices now"}
                disabled={
                  sync.status.state === "saving" ||
                  (sync.status.state !== "error" && (!editable || !isMember))
                }
                onPress={saveChoices}
              />
              {(sync.status.state === "error" || syncRefreshError) && (
                <Action
                  title="Refresh"
                  disabled={syncRefreshing}
                  onPress={refreshChoices}
                />
              )}
            </Actions>
          </Card>
          {isLeader && (
            <Card>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: leaderOpen }} onPress={() => setLeaderOpen(!leaderOpen)} style={styles.panelHeader}>
                <Label>{leaderOpen ? "▾" : "▸"} Leader review · {club.name}</Label>
                <Note>{Object.prototype.hasOwnProperty.call(cycle.finalized, club.id) ? "Finalized" : "Not finalized"}</Note>
              </Pressable>
              {leaderOpen && <>
              <Note>
                Member rankings are combined using points for each ranked
                position. Ties are resolved by title ID. Finalizing saves a
                shared club ordering; any ballot change invalidates it.
              </Note>
              {(
                reviewRanking ??
                cycle.finalized[club.id] ??
                rankings(data, cycle, club.id)
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
                disabled={!editable || shared.saving || syncRefreshing || !!syncRefreshError || sync.status.state === "saving" || sync.status.state === "error" || !!shared.error}
                onPress={() => {
                  const order =
                    reviewRanking ??
                    cycle.finalized[club.id] ??
                    rankings(data, cycle, club.id);
                  void shared
                    .mutate(() =>
                      finalizeRanking(cycle.id, club.id, order, cycle.revision),
                    )
                    .then(() => setReview(null))
                    .catch(() => undefined);
                }}
              />
              {!editable && (
                <Note>
                  Leader review is available only while voting is open.
                </Note>
              )}
              {editable && (syncRefreshing || syncRefreshError || sync.status.state === "saving" || sync.status.state === "error") && (
                <Note>Save all choices and refresh successfully before finalizing.</Note>
              )}
              </>}
            </Card>
          )}
        </>
      )}
      {staff && (
        <>
          <Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }}
              accessibilityLabel={`Clubs shown, ${shownClubIds.length} of ${availableClubs.length}`}
              onPress={() => setFiltersOpen(!filtersOpen)} style={styles.filterHeader}>
              <Label>{filtersOpen ? "▾" : "▸"} Clubs shown · {shownClubIds.length} of {data.clubs.length}</Label>
            </Pressable>
            {data.clubs.length === 0 ? (
              <Note>No clubs exist yet.</Note>
            ) : filtersOpen ? (
              <>
                <Actions>
                  <Action title="Show all" disabled={shownClubIds.length === data.clubs.length}
                    onPress={() => setReviewClubIds(data.clubs.map((value) => value.id))} />
                  <Action title="Hide all" disabled={shownClubIds.length === 0}
                    onPress={() => setReviewClubIds([])} />
                </Actions>
                <Actions>
                  {data.clubs.map((value) => (
                    <Action
                      key={value.id}
                      selected={shownClubIds.includes(value.id)}
                      title={value.name}
                      onPress={() =>
                        setReviewClubIds(
                          shownClubIds.includes(value.id)
                            ? shownClubIds.filter((id) => id !== value.id)
                            : [...shownClubIds, value.id],
                        )
                      }
                    />
                  ))}
                </Actions>
              </>
            ) : null}
          </Card>
          <Card>
            <Label>Preferences · {cycle.name}</Label>
            <Note>
              Club rankings use the finalized order where available, otherwise
              the combined member rankings. Previously read titles are excluded. Contested counts include shown clubs that rank the title.
            </Note>
            {shownClubIds.length === 0 && <Note>Select clubs to see preferences.</Note>}
            <PriorityGridView key={cycle.id}
              matrix={priorityMatrix(data, cycle, shownClubIds, data.assignments)}
              clubNameFor={(id) => data.clubs.find((value) => value.id === id)?.name ?? "Unknown club"}
              titleFor={(id) => data.titles.find((value) => value.id === id)}
              onHideClub={(id) => setReviewClubIds(shownClubIds.filter((clubId) => clubId !== id))}
            />
          </Card>
          <Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: summariesOpen }}
              onPress={() => setSummariesOpen(!summariesOpen)} style={styles.filterHeader}>
              <Label>{summariesOpen ? "▾" : "▸"} Club summaries · {shownClubIds.length} clubs</Label>
            </Pressable>
            {summariesOpen && (shownClubIds.length === 0 ? <Note>Select clubs to see preferences.</Note> : shownClubIds.map((id) => {
              const value = data.clubs.find((item) => item.id === id);
              const validOrder = clubPreferences(data, cycle, id);
              const expanded = expandedClubs.includes(id);
              return <Actions key={id}>
                <Text>
                  {value?.name ?? "Unknown club"} · {Object.prototype.hasOwnProperty.call(cycle.finalized, id) ? "Finalized" : "Combined"}:{" "}
                  {validOrder.length ? (expanded ? validOrder : validOrder.slice(0, 3)).map((titleId, index) =>
                    `${index + 1}. ${data.titles.find((title) => title.id === titleId)?.name ?? "Unavailable title"}`).join(" · ") : "No ranked titles"}
                </Text>
                {validOrder.length > 3 && <Action title={expanded ? "Show fewer" : `Show all ${validOrder.length} ranks`} onPress={() =>
                  setExpandedClubs(expanded ? expandedClubs.filter((clubId) => clubId !== id) : [...expandedClubs, id])} />}
              </Actions>;
            }))}
          </Card>
        </>
      )}
      {staff && (
        <Card>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: demandOpen }} onPress={() => setDemandOpen(!demandOpen)} style={styles.panelHeader}>
            <Label>{demandOpen ? "▾" : "▸"} Title demand · {shownClubIds.length} clubs</Label>
          </Pressable>
          {demandOpen && <>
          <Note>Interested clubs shown are counted once per title, regardless of finalization.</Note>
          {shownClubIds.length === 0 && <Note>Select clubs to see title demand.</Note>}
          {shownClubIds.length > 0 && demand.size === 0 && <Note>No selected titles for these clubs yet.</Note>}
          {data.titles.map((title) => {
            const interested = demand.get(title.id) ?? 0;
            if (!interested) return null;
            return (
              <Text key={title.id}>
                {title.name}: {interested} clubs ·{" "}
                {data.kits.filter((k) => k.titleId === title.id).length} kits
              </Text>
            );
          })}
          </>}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  panelHeader: { gap: 4 },
  filterHeader: { minHeight: 44, justifyContent: "center" },
});
