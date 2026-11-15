import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { today } from '../domain/dates';
import { finalizeRanking, saveBallot } from '../state/api';
import { rankings } from '../domain/logic';
import type { Ballot, Mark } from '../domain/model';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

function moved(list: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function Preferences() {
  const { data, update } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [review, setReview] = useState<{ key: string; ranking: string[] } | null>(null);
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const membershipClubs = person
    ? data.memberships.filter((membership) => membership.personId === person.id).map((membership) => membership.clubId)
    : [];
  const availableClubs = person?.role === 'member'
    ? data.clubs.filter((club) => membershipClubs.includes(club.id))
    : person ? data.clubs : [];
  const club = availableClubs.find((value) => value.id === data.selectedClubId);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const isMember = !!person && !!club && membershipClubs.includes(club.id);
  const isLeader = !!person && data.memberships.some((membership) =>
    membership.personId === person.id && membership.clubId === club?.id && membership.leader);
  const editable = !!cycle && cycle.status === 'collecting' && today() <= cycle.deadline;
  const ballot = cycle && club && person
    ? data.ballots.find((b) => b.cycleId === cycle.id && b.clubId === club.id && b.personId === person.id)
    : undefined;
  const reviewKey = `${cycle?.id ?? ''}:${club?.id ?? ''}:${person?.id ?? ''}`;
  const reviewRanking = review?.key === reviewKey ? review.ranking : null;

  function chooseClub(clubId: string) {
    setReview(null);
    void update((d) => ({ ...d, selectedClubId: clubId })).catch(() => undefined);
  }

  function changeBallot(fn: (current: Ballot) => Ballot) {
    if (!club || !cycle || !person || !editable || !isMember || shared.saving) return;
    const current: Ballot = ballot ?? {
      cycleId: cycle.id, clubId: club.id, personId: person.id, marks: {}, ranking: [], revision: 0,
    };
    const next = fn(current);
    setReview(null);
    void shared.mutate(() => saveBallot(next)).catch(() => undefined);
  }

  function mark(titleId: string, value: Mark | null) {
    changeBallot((current) => {
      const marks = { ...current.marks };
      if (value) marks[titleId] = value; else delete marks[titleId];
      const ranking = current.ranking.filter((id) => id !== titleId);
      if (value === 'selected') ranking.push(titleId);
      return { ...current, marks, ranking };
    });
  }

  if (!person) return <Page title="Preferences"><Note>No demo user is selected on this device. Choose a shared user in Settings; no user is selected automatically.</Note></Page>;
  if (!cycle) return <Page title="Preferences"><Note>No shared voting cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  return <Page title="Preferences">
    <Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((value) => <Action key={value.id} title={`${value.name}${value.id === cycle.id ? ' ✓' : ''}`} onPress={() => { setSelectedId(value.id); setReview(null); }} />)}</Actions></Card>
    <Card><Label>{cycle.name}</Label><Note>Status: {cycle.status} · Deadline: {cycle.deadline}. Voting is {editable ? 'open' : 'closed'}.</Note>
      {cycle.status !== 'collecting' && <Note>Voting is not open for this cycle.</Note>}
      {cycle.status === 'collecting' && today() > cycle.deadline && <Note>The preference deadline has passed.</Note>}
    </Card>
    {availableClubs.length > 0 && <Card><Label>Choose a club</Label><Actions>{availableClubs.map((value) => <Action key={value.id} title={`${value.name}${value.id === data.selectedClubId ? ' ✓' : ''}`} onPress={() => chooseClub(value.id)} />)}</Actions></Card>}
    {person.role === 'member' && availableClubs.length === 0 && <Note>This user has no club memberships. Staff can add memberships on the Clubs page.</Note>}
    {person.role === 'member' && availableClubs.length > 0 && !club && <Note>Choose a club to view this user’s independent preferences. Memberships and preferences are shared across devices.</Note>}
    {club && <><Card><Label>1. Choose titles for {club.name}</Label>
      {data.titles.length === 0 && <Note>No shared titles are available. Staff can add titles in the Catalog.</Note>}
      {data.titles.map((title) => <React.Fragment key={title.id}>
        <Text style={{ fontWeight: '600' }}>{title.name} — {title.author}</Text>
        {club.history.includes(title.id) ? <><Note>Excluded: this club has already read this title.{ballot?.marks[title.id] ? ` Existing mark: ${ballot.marks[title.id]}.` : ''}</Note>
          {ballot?.marks[title.id] && <Action title="Clear existing mark" disabled={!editable || !isMember || shared.saving} onPress={() => mark(title.id, null)} />}
        </> : <Actions>
          {(['selected', 'read', 'wont'] as const).map((value) => <Action key={value} title={`${value === 'selected' ? 'Select' : value === 'read' ? 'Already read' : 'Won’t read'}${ballot?.marks[title.id] === value ? ' ✓' : ''}`} disabled={!editable || !isMember || shared.saving} onPress={() => mark(title.id, value)} />)}
          <Action title="Clear" disabled={!editable || !isMember || shared.saving} onPress={() => mark(title.id, null)} />
        </Actions>}
      </React.Fragment>)}
      {!isMember && <Note>Only a user assigned to this club can submit preferences for it.</Note>}
    </Card><Card><Label>2. Rank selected titles</Label><Note>Move your favorite to the top. Each ranking is shared for this user, club and cycle.</Note>
      {(ballot?.ranking ?? []).map((titleId, index) => <Actions key={titleId}><Text>{index + 1}. {data.titles.find((t) => t.id === titleId)?.name ?? 'Unavailable title'}</Text>
        <Action title="↑" disabled={!editable || !isMember || shared.saving || index === 0 || !data.titles.some((t) => t.id === titleId)} onPress={() => changeBallot((current) => ({ ...current, ranking: moved(current.ranking, index, -1) }))} />
        <Action title="↓" disabled={!editable || !isMember || shared.saving || index === (ballot?.ranking.length ?? 0) - 1 || !data.titles.some((t) => t.id === titleId)} onPress={() => changeBallot((current) => ({ ...current, ranking: moved(current.ranking, index, 1) }))} />
      </Actions>)}
      {(ballot?.ranking.length ?? 0) === 0 && <Note>No selected titles to rank.</Note>}
    </Card>
    {isLeader && <Card><Label>Leader review · {club.name}</Label><Note>Member rankings are combined using points for each ranked position. Ties are resolved by title ID. Finalizing saves a shared club ordering; any ballot change invalidates it.</Note>
      {(reviewRanking ?? cycle.finalized[club.id] ?? rankings(data, cycle, club.id)).map((titleId, index, list) => <Actions key={titleId}>
        <Text>{index + 1}. {data.titles.find((t) => t.id === titleId)?.name ?? 'Unavailable title'}</Text>
        <Action title="↑" disabled={!editable || shared.saving || index === 0} onPress={() => setReview({ key: reviewKey, ranking: moved(list, index, -1) })} />
        <Action title="↓" disabled={!editable || shared.saving || index === list.length - 1} onPress={() => setReview({ key: reviewKey, ranking: moved(list, index, 1) })} />
      </Actions>)}
      <Action title="Finalize club ranking" disabled={!editable || shared.saving} onPress={() => {
        const order = reviewRanking ?? cycle.finalized[club.id] ?? rankings(data, cycle, club.id);
        void shared.mutate(() => finalizeRanking(cycle.id, club.id, order, cycle.revision))
          .then(() => setReview(null)).catch(() => undefined);
      }} />
      {!editable && <Note>Leader review is available only while voting is open.</Note>}
    </Card>}
    </>}
    {staff && <Card><Label>Title demand</Label><Note>Interested clubs are counted once per title.</Note>{data.titles.map((title) => {
      const interested = new Set(data.ballots.filter((b) => b.cycleId === cycle.id && b.marks[title.id] === 'selected').map((b) => b.clubId)).size;
      return <Text key={title.id}>{title.name}: {interested} clubs · {data.kits.filter((k) => k.titleId === title.id).length} kits</Text>;
    })}</Card>}
  </Page>;
}
