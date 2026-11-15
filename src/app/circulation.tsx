import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { circulate } from '../domain/logic';
import { today } from '../domain/dates';
import type { Event } from '../domain/model';
import { saveEvent } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

export default function Circulation() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [complete, setComplete] = useState(true);
  const [inspectId, setInspectId] = useState('');
  const [returned, setReturned] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const staff = person?.role === 'admin' || person?.role === 'staff';

  function record(kitId: string, action: Event['action']) {
    const kit = data.kits.find((item) => item.id === kitId);
    const sharedKit = shared.data.kits.find((item) => item.id === kitId);
    if (!kit || !sharedKit) { setMessage('Kit is unavailable. Refresh shared data before recording circulation.'); return; }
    const inspection = action === 'inspected'
      ? { returnedCopies: returned.trim() ? Number(returned) : -1, missingComponents: missing }
      : undefined;
    try {
      const next = circulate(data, kitId, action, notes, complete, inspection);
      const event = next.events[next.events.length - 1];
      const inspectionComplete = action === 'inspected' && inspection
        ? complete && inspection.returnedCopies === kit.copies && inspection.missingComponents.length === 0
        : complete;
      void shared.mutate(() => saveEvent(kitId, event, sharedKit.revision, inspectionComplete))
        .then(() => { setNotes(''); setInspectId(''); setMissing([]); setMessage('Shared circulation event recorded.'); })
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to record circulation.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record circulation.');
    }
  }

  if (!staff) return <Page title="Circulation"><Note>Switch to a staff or library-admin demo user in Settings to manage shared kit status.</Note></Page>;
  const search = query.trim().toLowerCase();
  const visibleKits = data.kits.filter((kit) =>
    `${kit.barcode} ${data.titles.find((title) => title.id === kit.titleId)?.name ?? ''}`.toLowerCase().includes(search));
  return <Page title="Circulation"><Note>Kit status and append-only circulation history are shared across devices. The API validates each transition.</Note>
    <Field label="Find a kit by barcode or title" value={query} onChangeText={setQuery} />
    {data.kits.length === 0 && <Note>No shared kits are available. Staff can create kits in the Catalog, or an administrator can run the demo seed.</Note>}
    <Field label="Event notes" value={notes} onChangeText={setNotes} />
    {visibleKits.map((kit) =>
      <Card key={kit.id}><Label>{kit.barcode} · {data.titles.find((title) => title.id === kit.titleId)?.name ?? 'Unavailable title'}</Label><Text>{kit.status} · {kit.copies} copies · {kit.branch}</Text>
        {kit.status === 'out' && data.assignments.filter((assignment) => assignment.kitId === kit.id && assignment.ready <= today() &&
          data.cycles.some((cycle) => cycle.id === assignment.cycleId && cycle.status === 'published'))
          .sort((a, b) => b.ready.localeCompare(a.ready)).slice(0, 1)
          .map((assignment) => <Text key={assignment.id}>Due {assignment.due}{assignment.due < today() ? ' · OVERDUE' : ''}</Text>)}
        <Actions>
          {kit.status === 'available' && <Action title="Reserve" disabled={shared.saving} onPress={() => record(kit.id, 'reserved')} />}
          {(kit.status === 'available' || kit.status === 'reserved') && <><Action title="Pick up" disabled={shared.saving} onPress={() => record(kit.id, 'picked up')} /><Action title="Deliver" disabled={shared.saving} onPress={() => record(kit.id, 'delivered')} /></>}
          {kit.status === 'out' && <Action title="Return" disabled={shared.saving} onPress={() => record(kit.id, 'returned')} />}
          {kit.status === 'inspection' && <Action title="Inspect returned kit" disabled={shared.saving} onPress={() => { setInspectId(kit.id); setReturned(String(kit.copies)); setMissing([]); setComplete(true); }} />}
          {kit.status === 'unavailable' && <Action title="Resolve and make available" disabled={shared.saving} onPress={() => record(kit.id, 'resolved')} />}
        </Actions>
        {inspectId === kit.id && kit.status === 'inspection' && <><Field label="Copies returned" value={returned} onChangeText={setReturned} />
          <Note>Mark missing components:</Note><Actions>{kit.components.map((part) => <Action key={part} title={`${part}${missing.includes(part) ? ' · missing' : ''}`} onPress={() =>
            setMissing(missing.includes(part) ? missing.filter((value) => value !== part) : [...missing, part])} />)}</Actions>
          <Action title={`Damage or other issue: ${complete ? 'no' : 'yes'}`} onPress={() => setComplete(!complete)} />
          <Actions><Action title="Save inspection" disabled={shared.saving} onPress={() => record(kit.id, 'inspected')} /><Action title="Cancel inspection" onPress={() => setInspectId('')} /></Actions>
        </>}
        {data.events.filter((event) => event.kitId === kit.id).slice().sort((a, b) => b.at.localeCompare(a.at)).map((event) =>
          <Text key={event.id}>{new Date(event.at).toLocaleString()} · {event.action}{event.returnedCopies !== undefined ? ` · ${event.returnedCopies} returned` : ''}{event.missingComponents?.length ? ` · Missing: ${event.missingComponents.join(', ')}` : ''}{event.notes ? ` · ${event.notes}` : ''}</Text>)}
      </Card>)}
    {message ? <Text>{message}</Text> : null}
  </Page>;
}
