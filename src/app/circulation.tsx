import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { circulate } from '../domain/logic';
import { today } from '../domain/dates';
import type { Event } from '../domain/model';
import { useStore } from '../state/store';

export default function Circulation() {
  const { data, update } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [complete, setComplete] = useState(true);
  const [inspectId, setInspectId] = useState('');
  const [returned, setReturned] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  function record(kitId: string, action: Event['action']) {
    const inspection = action === 'inspected' ? { returnedCopies: returned.trim() ? Number(returned) : -1, missingComponents: missing } : undefined;
    void update((d) => circulate(d, kitId, action, notes, complete, inspection)).then(() => { setNotes(''); setInspectId(''); setMissing([]); }).catch(() => undefined);
  }
  if (!staff) return <Page title="Circulation"><Note>Switch to a staff or library-admin demo person to manage kits.</Note></Page>;
  return <Page title="Circulation"><Field label="Find a kit by barcode or title" value={query} onChangeText={setQuery} />
    <Field label="Event notes, returned count or damage" value={notes} onChangeText={setNotes} />
    {data.kits.filter((k) => `${k.barcode} ${data.titles.find((t) => t.id === k.titleId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())).map((kit) =>
      <Card key={kit.id}><Label>{kit.barcode} · {data.titles.find((t) => t.id === kit.titleId)?.name}</Label><Text>{kit.status} · {kit.copies} copies · {kit.branch}</Text>
        {kit.status === 'out' && data.assignments.filter((a) => a.kitId === kit.id && a.ready <= today() && data.cycles.some((c) => c.id === a.cycleId && c.status === 'published')).sort((a, b) => b.ready.localeCompare(a.ready)).slice(0, 1).map((a) => <Text key={a.id}>Due {a.due}{a.due < today() ? ' · OVERDUE' : ''}</Text>)}
        <Actions>
          {kit.status === 'available' && <Action title="Reserve" onPress={() => record(kit.id, 'reserved')} />}
          {(kit.status === 'available' || kit.status === 'reserved') && <><Action title="Pick up" onPress={() => record(kit.id, 'picked up')} /><Action title="Deliver" onPress={() => record(kit.id, 'delivered')} /></>}
          {kit.status === 'out' && <Action title="Return" onPress={() => record(kit.id, 'returned')} />}
          {kit.status === 'inspection' && <Action title="Inspect returned kit" onPress={() => { setInspectId(kit.id); setReturned(String(kit.copies)); setMissing([]); setComplete(true); }} />}
          {kit.status === 'unavailable' && <Action title="Resolve and make available" onPress={() => record(kit.id, 'resolved')} />}
        </Actions>
        {inspectId === kit.id && kit.status === 'inspection' && <><Field label="Copies returned" value={returned} onChangeText={setReturned} />
          <Note>Mark missing components:</Note><Actions>{kit.components.map((part) => <Action key={part} title={`${part}${missing.includes(part) ? ' · missing' : ''}`} onPress={() => setMissing(missing.includes(part) ? missing.filter((v) => v !== part) : [...missing, part])} />)}</Actions>
          <Action title={`Damage or other issue: ${complete ? 'no' : 'yes'}`} onPress={() => setComplete(!complete)} />
          <Actions><Action title="Save inspection" onPress={() => record(kit.id, 'inspected')} /><Action title="Cancel inspection" onPress={() => setInspectId('')} /></Actions>
        </>}
        {data.events.filter((e) => e.kitId === kit.id).slice().reverse().map((e) => <Text key={e.id}>{new Date(e.at).toLocaleString()} · {e.action}{e.returnedCopies !== undefined ? ` · ${e.returnedCopies} returned` : ''}{e.missingComponents?.length ? ` · Missing: ${e.missingComponents.join(', ')}` : ''}{e.notes ? ` · ${e.notes}` : ''}</Text>)}
      </Card>)}
  </Page>;
}
