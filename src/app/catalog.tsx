import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import type { Kit, Title } from '../domain/model';
import { useStore } from '../state/store';
import { deleteRecord, saveRecord } from '../state/api';
import { useShared } from '../state/shared';

const blankTitle = (): Title => ({ id: '', name: '', author: '', isbn: '', pages: 0, genres: '', notes: '', largePrint: false, audio: false });
const blankKit = (branch: string): Kit => ({ id: '', titleId: '', barcode: '', branch, copies: 1, extras: '', components: [], status: 'available' });

export default function Catalog() {
  const { data } = useStore();
  const shared = useShared();
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState<Title>(blankTitle);
  const [pages, setPages] = useState('');
  const [kit, setKit] = useState<Kit>(() => blankKit(data.library.branches[0] ?? ''));
  const [copies, setCopies] = useState('1');
  const [components, setComponents] = useState('');
  const [message, setMessage] = useState('');
  const [titleRevision, setTitleRevision] = useState<number | null>(null);
  const [kitRevision, setKitRevision] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'titles' | 'kits'; id: string; revision: number; name: string } | null>(null);
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const search = query.trim().toLowerCase();
  function editTitle(value: Title) { setTitle(value); setTitleRevision(shared.data.titles.find((item) => item.id === value.id)?.revision ?? null); setPages(value.pages ? String(value.pages) : ''); }
  function editKit(value: Kit) { setKit(value); setKitRevision(shared.data.kits.find((item) => item.id === value.id)?.revision ?? null); setCopies(String(value.copies)); setComponents(value.components.join(', ')); }
  function saveTitle() {
    const count = pages.trim() ? Number(pages) : 0;
    if (!title.name.trim() || !title.author.trim() || !Number.isInteger(count) || count < 0) { setMessage('Enter a title, author and a nonnegative whole page count.'); return; }
    const value = { ...title, name: title.name.trim(), author: title.author.trim(), pages: count, ...(titleRevision === null ? {} : { revision: titleRevision }) };
    void shared.mutate(() => saveRecord('titles', value))
      .then(() => { editTitle(blankTitle()); setMessage('Title saved.'); }).catch(() => undefined);
  }
  function saveKit() {
    const count = Number(copies);
    const identifiers = components.split(',').map((v) => v.trim()).filter(Boolean);
    if (!kit.titleId || !kit.barcode.trim() || !kit.branch.trim() || !Number.isInteger(count) || count < 1 || identifiers.length > count) {
      setMessage('Select a title, enter a barcode and branch, and use a positive copy count at least as large as the component list.'); return;
    }
    const { status: _status, ...fields } = kit;
    const value = { ...fields, barcode: kit.barcode.trim(), branch: kit.branch.trim(), copies: count, components: identifiers, ...(kitRevision === null ? {} : { revision: kitRevision }) };
    const old = data.kits.find((item) => item.id === kit.id);
    if (old && old.titleId !== kit.titleId && data.assignments.some((item) => item.kitId === kit.id)) { setMessage('Cannot change the title of a kit referenced by a shared schedule.'); return; }
    void shared.mutate(() => saveRecord('kits', value))
      .then(() => { editKit(blankKit(data.library.branches[0] ?? '')); setMessage('Kit saved.'); }).catch(() => undefined);
  }
  return <Page title="Catalog & kits">
    <Actions><Action title="Refresh shared catalog" onPress={() => { void shared.refresh().catch(() => undefined); }} /></Actions>
    <Note>Titles, kits, kit status and circulation are shared across devices.</Note>
    {deleting && <Card><Label>Delete {deleting.name}?</Label><Note>This affects every user and may fail if the record is referenced.</Note><Actions>
      <Action tone="danger" title="Confirm deletion" onPress={() => { void shared.mutate(() => deleteRecord(deleting.kind, deleting.id, deleting.revision)).then(() => { setDeleting(null); setMessage('Record deleted.'); }).catch(() => undefined); }} />
      <Action title="Cancel deletion" onPress={() => setDeleting(null)} /></Actions></Card>}
    <Field label="Search titles, authors or kit barcode" value={query} onChangeText={setQuery} />
    {data.titles.filter((t) => !search || `${t.name} ${t.author} ${t.isbn}`.toLowerCase().includes(search) || data.kits.some((k) => k.titleId === t.id && [k.barcode, ...k.components].some((b) => b.toLowerCase().includes(search)))).map((item) =>
      <Card key={item.id}><Label>{item.name}</Label><Note>{item.author} {item.isbn ? `· ISBN ${item.isbn}` : ''}</Note>
        <Note>{item.genres || 'No genres'} · {item.pages || 'Unknown'} pages · {item.largePrint ? 'Large print' : 'No large print'} · {item.audio ? 'Audio available' : 'No audio'}</Note>
        {item.notes ? <Text>Content notes: {item.notes}</Text> : null}
        {staff && <Actions><Action title="Edit title" onPress={() => editTitle(item)} /><Action tone="danger" title="Delete title" onPress={() => {
          const record = shared.data.titles.find((title) => title.id === item.id);
          if (record) setDeleting({ kind: 'titles', id: record.id, revision: record.revision, name: record.name });
        }} /></Actions>}
        {data.kits.filter((k) => k.titleId === item.id).map((value) => <React.Fragment key={value.id}><Text>{value.barcode} · {value.branch} · {value.copies} copies · {value.status}{value.extras ? ` · ${value.extras}` : ''}</Text>
          {value.components.length > 0 && <Note>Copies: {value.components.join(', ')}</Note>}
          {staff && <Actions><Action title={`Edit ${value.barcode}`} onPress={() => editKit(value)} /><Action tone="danger" title={`Delete ${value.barcode}`} onPress={() => {
            const record = shared.data.kits.find((item) => item.id === value.id);
            if (record) setDeleting({ kind: 'kits', id: record.id, revision: record.revision, name: record.barcode });
          }} /></Actions>}
        </React.Fragment>)}
      </Card>)}
    {staff && <><Card><Label>{title.id ? 'Edit title' : 'Add title'}</Label>
      <Field label="Title" value={title.name} onChangeText={(name) => setTitle({ ...title, name })} /><Field label="Author" value={title.author} onChangeText={(author) => setTitle({ ...title, author })} />
      <Field label="ISBN" value={title.isbn} onChangeText={(isbn) => setTitle({ ...title, isbn })} /><Field label="Pages" value={pages} onChangeText={setPages} />
      <Field label="Genres" value={title.genres} onChangeText={(genres) => setTitle({ ...title, genres })} /><Field label="Content notes" value={title.notes} onChangeText={(notes) => setTitle({ ...title, notes })} />
      <Actions><Action selected={title.largePrint} title={`Large print: ${title.largePrint ? 'yes' : 'no'}`} onPress={() => setTitle({ ...title, largePrint: !title.largePrint })} /><Action selected={title.audio} title={`Audio: ${title.audio ? 'yes' : 'no'}`} onPress={() => setTitle({ ...title, audio: !title.audio })} /></Actions>
      <Actions><Action tone="primary" title="Save title" onPress={saveTitle} /><Action title="Clear title form" onPress={() => editTitle(blankTitle())} /></Actions>
    </Card><Card><Label>{kit.id ? 'Edit kit' : 'Add physical kit'}</Label><Note>Select the title:</Note><Actions>{data.titles.map((t) => <Action key={t.id} selected={kit.titleId === t.id} title={`${t.name}${kit.titleId === t.id ? ' ✓' : ''}`} onPress={() => setKit({ ...kit, titleId: t.id })} />)}</Actions>
      <Field label="Kit barcode" value={kit.barcode} onChangeText={(barcode) => setKit({ ...kit, barcode })} /><Field label="Branch" value={kit.branch} onChangeText={(branch) => setKit({ ...kit, branch })} />
      <Field label="Number of copies" value={copies} onChangeText={setCopies} /><Field label="Extras" value={kit.extras} onChangeText={(extras) => setKit({ ...kit, extras })} />
      <Field label="Copy barcodes (comma separated)" value={components} onChangeText={setComponents} /><Actions><Action tone="primary" title="Save kit" onPress={saveKit} /><Action title="Clear kit form" onPress={() => editKit(blankKit(data.library.branches[0] ?? ''))} /></Actions>
    </Card>{message ? <Text>{message}</Text> : null}</>}
  </Page>;
}
