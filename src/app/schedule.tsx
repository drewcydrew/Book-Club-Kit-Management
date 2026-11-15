import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { assignmentProblem, draft } from '../domain/logic';
import { useStore } from '../state/store';

export default function Schedule() {
  const { data, update } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const selectedCycle = data.cycles.find((c) => c.id === selectedId);
  const [messages, setMessages] = useState<string[]>([]);
  const [replacement, setReplacement] = useState<{ assignmentId: string; kitId: string } | null>(null);
  const [swap, setSwap] = useState<{ firstId: string; secondId: string } | null>(null);
  if (!selectedCycle || !person) return <Page title="Schedule"><Note>No cycle is available.</Note></Page>;
  const cycle = selectedCycle;
  const staff = person.role === 'staff' || person.role === 'admin';
  const assignments = data.assignments.filter((a) => a.cycleId === cycle.id && (staff || (cycle.status === 'published' && a.clubId === person.clubId)));
  function generate() {
    if (cycle.status !== 'collecting' && cycle.status !== 'drafted') return;
    const result = draft(data, cycle);
    setMessages(result.problems);
    if (result.problems.some((p) => p.startsWith('Locked assignment'))) return;
    void update((d) => ({ ...d, assignments: result.assignments, cycles: d.cycles.map((c) => c.id === cycle.id ? { ...c, status: 'drafted' } : c) })).catch(() => undefined);
  }
  function publish() {
    const all = data.assignments.filter((a) => a.cycleId === cycle.id);
    const errors = all.map((a) => assignmentProblem(data, a, data.assignments)).filter((v): v is string => !!v);
    if (cycle.slots.length === 0 || all.length !== cycle.slots.length || new Set(all.map((a) => a.slotId)).size !== cycle.slots.length) errors.push('Every meeting slot must have exactly one assignment before publishing.');
    if (errors.length) { setMessages(errors); return; }
    void update((d) => ({ ...d, cycles: d.cycles.map((c) => c.id === cycle.id ? { ...c, status: 'published' } : c) })).then(() => setMessages([])).catch(() => undefined);
  }
  return <Page title="Schedule"><Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((c) => <Action key={c.id} title={`${c.name}${c.id === cycle.id ? ' ✓' : ''}`} onPress={() => { setSelectedId(c.id); setMessages([]); setReplacement(null); setSwap(null); }} />)}</Actions></Card>
  <Card><Label>{cycle.name} · {cycle.status}</Label><Note>Local greedy draft: preferences first, with prior-cycle satisfaction and same-branch kits as tie-breakers. Loans include a {data.library.bufferDays}-day turnaround buffer. A draft can be incomplete and is not guaranteed optimal. Generating closes voting, even before the deadline.</Note>
    {staff && <Actions><Action title="Close voting and generate / re-run draft" disabled={cycle.status !== 'collecting' && cycle.status !== 'drafted'} onPress={generate} /><Action title="Publish schedule" disabled={cycle.status !== 'drafted'} onPress={publish} /></Actions>}
    {messages.map((m, i) => <Text key={`${m}-${i}`} style={{ color: '#a22525' }}>{m}</Text>)}
  </Card>
  {assignments.length === 0 && <Note>{staff ? 'No assignments yet.' : 'No published schedule for your club.'}</Note>}
  {assignments.map((a) => {
    const kit = data.kits.find((k) => k.id === a.kitId);
    const title = data.titles.find((t) => t.id === kit?.titleId);
    const club = data.clubs.find((c) => c.id === a.clubId);
    const problem = assignmentProblem(data, a, data.assignments);
    return <Card key={a.id}><Label>{club?.name ?? 'Unavailable club'} · {title?.name ?? 'Unavailable title'}</Label><Text>{kit?.barcode ?? 'Unavailable kit'} · Ready {a.ready} · Meeting {a.meeting} · Due {a.due}</Text>
      {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
      {staff && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem && a.locked)) && <Actions><Action title={a.locked ? 'Unlock' : 'Lock'} onPress={() => {
        void update((d) => ({ ...d, assignments: d.assignments.map((item) => item.id === a.id ? { ...item, locked: !item.locked } : item) })).catch(() => undefined);
      }} /></Actions>}
      {staff && !a.locked && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem)) && <><Note>Choose a feasible replacement kit:</Note><Actions>{data.kits.filter((k) => k.id !== a.kitId && !assignmentProblem(data, { ...a, kitId: k.id }, data.assignments)).map((k) => <Action key={k.id} title={`${k.barcode} · ${data.titles.find((t) => t.id === k.titleId)?.name}`} onPress={() => setReplacement({ assignmentId: a.id, kitId: k.id })} />)}</Actions>
      {replacement?.assignmentId === a.id && <Actions><Action title="Confirm replacement" onPress={() => {
        void update((d) => {
          const current = d.assignments.find((item) => item.id === a.id);
          if (!current || current.locked) throw new Error('Assignment no longer exists or is locked.');
          const changed = { ...current, kitId: replacement.kitId };
          const conflict = assignmentProblem(d, changed, d.assignments);
          if (conflict) throw new Error(conflict);
          return { ...d, assignments: d.assignments.map((item) => item.id === a.id ? changed : item) };
        }).then(() => setReplacement(null)).catch(() => undefined);
      }} /><Action title="Cancel replacement" onPress={() => setReplacement(null)} /></Actions>}
      {cycle.status === 'drafted' && <><Note>Swap with another unlocked meeting:</Note><Actions>{assignments.filter((other) => other.id !== a.id && !other.locked && other.kitId !== a.kitId).map((other) => <Action key={other.id} title={`${data.clubs.find((c) => c.id === other.clubId)?.name} · ${other.meeting}`} onPress={() => setSwap({ firstId: a.id, secondId: other.id })} />)}</Actions>
      {swap?.firstId === a.id && <Actions><Action title="Confirm swap" onPress={() => {
        void update((d) => {
          const first = d.assignments.find((item) => item.id === swap.firstId);
          const second = d.assignments.find((item) => item.id === swap.secondId);
          if (!first || !second || first.locked || second.locked) throw new Error('Assignments no longer exist or are locked.');
          const firstChanged = { ...first, kitId: second.kitId };
          const secondChanged = { ...second, kitId: first.kitId };
          const rest = d.assignments.filter((item) => item.id !== first.id && item.id !== second.id);
          const conflict = assignmentProblem(d, firstChanged, [...rest, secondChanged]) || assignmentProblem(d, secondChanged, [...rest, firstChanged]);
          if (conflict) throw new Error(conflict);
          return { ...d, assignments: [...rest, firstChanged, secondChanged] };
        }).then(() => setSwap(null)).catch(() => undefined);
      }} /><Action title="Cancel swap" onPress={() => setSwap(null)} /></Actions>}</>}
      </>}
    </Card>;
  })}
  </Page>;
}
