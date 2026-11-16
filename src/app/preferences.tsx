import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Action, Actions, Card, Label, Note, Page } from "../components/ui";
import { RankingList } from "../components/ranking-list";
import { TitleGallery } from "../components/title-gallery";
import {
  ballotKey,
  emptyBallot,
  moveInRanking,
  setMark,
} from "../domain/ballot-draft";
import { today } from "../domain/dates";
import { finalizeRanking, saveBallot } from "../state/api";
import { useBallotSync } from "../state/ballot-sync";
import { rankings } from "../domain/logic";
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
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? "");
  const [clubId, setClubId] = useState("");
  const [review, setReview] = useState<{
    key: string;
    ranking: string[];
  } | null>(null);
  const [draft, setDraft] = useState<{ key: string; ballot: Ballot } | null>(
    null,
  );
  const draftRef = useRef<{ key: string; ballot: Ballot } | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [lastDismissedId, setLastDismissedId] = useState<string | null>(null);
  const sync = useBallotSync(
    saveBallot,
    () => void shared.refresh().catch(() => undefined),
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
  const club = availableClubs.find((value) => value.id === clubId);
  const staff = person?.role === "staff" || person?.role === "admin";
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
  const ballot = draft?.key === currentKey ? draft.ballot : serverBallot;
  const reviewKey = `${cycle?.id ?? ""}:${club?.id ?? ""}:${person?.id ?? ""}`;
  const reviewRanking = review?.key === reviewKey ? review.ranking : null;
  const clubRead = club
    ? data.titles.filter((title) => club.history.includes(title.id))
    : [];
  const selectedCount = Object.values(ballot?.marks ?? {}).filter(
    (value) => value === "selected",
  ).length;

  function chooseClub(value: string) {
    setReview(null);
    setLastDismissedId(null);
    setClubId(value);
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
    const latest =
      draftRef.current?.key === currentKey ? draftRef.current.ballot : ballot;
    const current = latest ?? emptyBallot(cycle.id, club.id, person.id);
    const next = fn(current);
    draftRef.current = { key: currentKey, ballot: next };
    setDraft(draftRef.current);
    setReview(null);

    sync.enqueue(withFreshRevision(next));
  }

  function saveChoices() {
    if (sync.status.state === "error" && draft?.key === currentKey) {
      sync.enqueue(withFreshRevision(draft.ballot));
    }
    sync.flush().catch(() => undefined);
  }

  function mark(titleId: string, value: Mark | null) {
    setLastDismissedId(value === "wont" ? titleId : null);
    changeBallot((current) => setMark(current, titleId, value));
  }

  if (!person)
    return (
      <Page title="Preferences">
        <Note>
          No demo user is selected on this device. Choose a shared user in
          Settings; no user is selected automatically.
        </Note>
      </Page>
    );
  if (!cycle)
    return (
      <Page title="Preferences">
        <Note>
          No shared voting cycle is available. Staff can create one, or an
          administrator can run the explicit server demo seed.
        </Note>
      </Page>
    );
  return (
    <Page title="Preferences">
      <Card>
        <Label>Choose a cycle</Label>
        <Actions>
          {data.cycles.map((value) => (
            <Action
              key={value.id}
              selected={value.id === cycle.id}
              title={`${value.name}${value.id === cycle.id ? " ✓" : ""}`}
              onPress={() => {
                setSelectedId(value.id);
                setReview(null);
                setLastDismissedId(null);
              }}
            />
          ))}
        </Actions>
      </Card>
      <Card>
        <Label>{cycle.name}</Label>
        <Note>
          Status: {cycle.status} · Deadline: {cycle.deadline}. Voting is{" "}
          {editable ? "open" : "closed"}.
        </Note>
        {cycle.status !== "collecting" && (
          <Note>Voting is not open for this cycle.</Note>
        )}
        {cycle.status === "collecting" && today() > cycle.deadline && (
          <Note>The preference deadline has passed.</Note>
        )}
      </Card>
      {availableClubs.length > 0 && (
        <Card>
          <Label>Choose a club</Label>
          <Actions>
            {availableClubs.map((value) => (
              <Action
                key={value.id}
                selected={value.id === clubId}
                title={`${value.name}${value.id === clubId ? " ✓" : ""}`}
                onPress={() => chooseClub(value.id)}
              />
            ))}
          </Actions>
        </Card>
      )}
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
      {club && (
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
            <Label>2. Rank selected titles</Label>
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
          </Card>
          <Card>
            <Label>3. Save choices</Label>
            <Note>
              {sync.status.state === "error"
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
                title="Save choices"
                disabled={
                  !editable || !isMember || sync.status.state === "saving"
                }
                onPress={saveChoices}
              />
              {sync.status.state === "error" && (
                <Action
                  title="Refresh"
                  onPress={() => void shared.refresh().catch(() => undefined)}
                />
              )}
            </Actions>
          </Card>
          {isLeader && (
            <Card>
              <Label>Leader review · {club.name}</Label>
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
                disabled={!editable || shared.saving}
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
            </Card>
          )}
        </>
      )}
      {staff && (
        <Card>
          <Label>Title demand</Label>
          <Note>Interested clubs are counted once per title.</Note>
          {data.titles.map((title) => {
            const interested = new Set(
              data.ballots
                .filter(
                  (b) =>
                    b.cycleId === cycle.id && b.marks[title.id] === "selected",
                )
                .map((b) => b.clubId),
            ).size;
            return (
              <Text key={title.id}>
                {title.name}: {interested} clubs ·{" "}
                {data.kits.filter((k) => k.titleId === title.id).length} kits
              </Text>
            );
          })}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  panelHeader: { gap: 4 },
});
