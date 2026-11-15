import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { today } from '../domain/dates';
import { rankings } from '../domain/logic';
import type { Ballot, Mark } from '../domain/model';
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
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const selectedCycle = data.cycles.find((c) => c.id === selectedId);
  const club = data.clubs.find((c) => c.id === person?.clubId);
  const [review, setReview] = useState<{ key: string; ranking: string[] } | null>(null);
  if (!selectedCycle || !person) return <Page title="Preferences"><Note>No cycle is available.</Note></Page>;
  const cycle = selectedCycle;
  const personId = person.id;
  const reviewKey = `${cycle.id}:${personId}`;
  const reviewRanking = review?.key === reviewKey ? review.ranking : null;
  const editable = cycle.status === 'collecting' && today() <= cycle.deadline;
  const ballot = data.ballots.find((b) => b.cycleId === cycle.id && b.personId === person.id);
  function changeBallot(fn: (ballot: Ballot) => Ballot) {
    if (!club || !editable) return;
    void update((d) => {
      const current = d.ballots.find((b) => b.cycleId === cycle.id && b.personId === personId)
        ?? { cycleId: cycle.id, clubId: club.id, personId, marks: {}, ranking: [] };
      const currentCycle = d.cycles.find((c) => c.id === cycle.id);
      if (!currentCycle || currentCycle.status !== 'collecting' || today() > currentCycle.deadline) throw new Error('Voting has closed.');
      const finalized = { ...currentCycle.finalized };
      delete finalized[club.id];
      return { ...d, cycles: d.cycles.map((c) => c.id === cycle.id ? { ...c, finalized } : c),
        ballots: [...d.ballots.filter((b) => !(b.cycleId === cycle.id && b.personId === personId)), fn(current)] };
    }).then(() => setReview(null)).catch(() => undefined);
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
  const staff = person.role === 'staff' || person.role === 'admin';
  return <Page title="Preferences">
    <Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((c) => <Action key={c.id} title={`${c.name}${c.id === cycle.id ? ' ✓' : ''}`} onPress={() => { setSelectedId(c.id); setReview(null); }} />)}</Actions></Card>
    <Card><Label>{cycle.name}</Label><Note>Status: {cycle.status} · Deadline: {cycle.deadline}. Voting is {editable ? 'open' : 'closed'}.</Note></Card>
    {!staff && person.clubId && !club && <Note>Your local demo membership references a club that is no longer available.</Note>}
    {club && <><Card><Label>1. Choose titles for {club.name}</Label>
      {data.titles.map((title) => <React.Fragment key={title.id}>
        <Text style={{ fontWeight: '600' }}>{title.name} — {title.author}</Text>
        {club.history.includes(title.id) ? <Note>Excluded: your club has already read this title.</Note> : <Actions>
          {(['selected', 'read', 'wont'] as const).map((value) => <Action key={value} title={`${value === 'selected' ? 'Select' : value === 'read' ? 'Already read' : 'Won’t read'}${ballot?.marks[title.id] === value ? ' ✓' : ''}`} disabled={!editable} onPress={() => mark(title.id, value)} />)}
          <Action title="Clear" disabled={!editable} onPress={() => mark(title.id, null)} />
        </Actions>}
      </React.Fragment>)}
    </Card><Card><Label>2. Rank selected titles</Label><Note>Move your favorite to the top. Changes save locally.</Note>
      {(ballot?.ranking ?? []).map((titleId, index) => <Actions key={titleId}><Text>{index + 1}. {data.titles.find((t) => t.id === titleId)?.name ?? 'Unavailable title'}</Text>
        <Action title="↑" disabled={!editable || index === 0 || !data.titles.some((t) => t.id === titleId)} onPress={() => changeBallot((b) => ({ ...b, ranking: moved(b.ranking, index, -1) }))} />
        <Action title="↓" disabled={!editable || index === (ballot?.ranking.length ?? 0) - 1 || !data.titles.some((t) => t.id === titleId)} onPress={() => changeBallot((b) => ({ ...b, ranking: moved(b.ranking, index, 1) }))} />
      </Actions>)}
    </Card>
    {person.role === 'leader' && <Card><Label>Leader review</Label><Note>Member rankings are combined using points for each ranked position. Ties are resolved by title ID. Finalizing saves your ordering without changing ballots.</Note>
      {(reviewRanking ?? cycle.finalized[club.id] ?? rankings(data, cycle, club.id)).map((titleId, index, list) => <Actions key={titleId}>
        <Text>{index + 1}. {data.titles.find((t) => t.id === titleId)?.name}</Text>
        <Action title="↑" disabled={!editable || index === 0} onPress={() => setReview({ key: reviewKey, ranking: moved(list, index, -1) })} />
        <Action title="↓" disabled={!editable || index === list.length - 1} onPress={() => setReview({ key: reviewKey, ranking: moved(list, index, 1) })} />
      </Actions>)}
      <Action title="Finalize club ranking" disabled={!editable} onPress={() => {
        const order = reviewRanking ?? cycle.finalized[club.id] ?? rankings(data, cycle, club.id);
        void update((d) => {
          const currentCycle = d.cycles.find((c) => c.id === cycle.id);
          if (!currentCycle || currentCycle.status !== 'collecting' || today() > currentCycle.deadline) throw new Error('Voting has closed.');
          return { ...d, cycles: d.cycles.map((c) => c.id === cycle.id ? { ...c, finalized: { ...c.finalized, [club.id]: order } } : c) };
        }).then(() => setReview(null)).catch(() => undefined);
      }} />
    </Card>}</>}
    {staff && <Card><Label>Title demand</Label><Note>Interested clubs are counted once per title.</Note>{data.titles.map((title) => {
      const interested = new Set(data.ballots.filter((b) => b.cycleId === cycle.id && b.marks[title.id] === 'selected').map((b) => b.clubId)).size;
      return <Text key={title.id}>{title.name}: {interested} clubs · {data.kits.filter((k) => k.titleId === title.id).length} kits</Text>;
    })}</Card>}
  </Page>;
}
