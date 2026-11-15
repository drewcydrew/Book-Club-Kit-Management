import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { id } from '../domain/logic';
import type { Kit, Title } from '../domain/model';
import { useStore } from '../state/store';

const blankTitle = (): Title => ({ id: '', name: '', author: '', isbn: '', pages: 0, genres: '', notes: '', largePrint: false, audio: false });
const blankKit = (branch: string): Kit => ({ id: '', titleId: '', barcode: '', branch, copies: 1, extras: '', components: [], status: 'available' });

export default function Catalog() {
  const { data, update } = useStore();
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState<Title>(blankTitle);
  const [pages, setPages] = useState('');
  const [kit, setKit] = useState<Kit>(() => blankKit(data.library.branches[0] ?? ''));
  const [copies, setCopies] = useState('1');
  const [components, setComponents] = useState('');
  const [message, setMessage] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const search = query.trim().toLowerCase();
  function editTitle(value: Title) { setTitle(value); setPages(value.pages ? String(value.pages) : ''); }
  function editKit(value: Kit) { setKit(value); setCopies(String(value.copies)); setComponents(value.components.join(', ')); }
  function saveTitle() {
    const count = pages.trim() ? Number(pages) : 0;
    if (!title.name.trim() || !title.author.trim() || !Number.isInteger(count) || count < 0) { setMessage('Enter a title, author and a nonnegative whole page count.'); return; }
    const value = { ...title, id: title.id || id(), name: title.name.trim(), author: title.author.trim(), pages: count };
    void update((d) => ({ ...d, titles: [...d.titles.filter((t) => t.id !== value.id), value] }))
      .then(() => { editTitle(blankTitle()); setMessage('Title saved.'); }).catch(() => undefined);
  }
  function saveKit() {
    const count = Number(copies);
    const identifiers = components.split(',').map((v) => v.trim()).filter(Boolean);
    if (!kit.titleId || !kit.barcode.trim() || !kit.branch.trim() || !Number.isInteger(count) || count < 1 || identifiers.length > count) {
      setMessage('Select a title, enter a barcode and branch, and use a positive copy count at least as large as the component list.'); return;
    }
    const value = { ...kit, id: kit.id || id(), barcode: kit.barcode.trim(), branch: kit.branch.trim(), copies: count, components: identifiers };
    void update((d) => {
      const old = d.kits.find((k) => k.id === value.id);
      if (!d.titles.some((t) => t.id === value.titleId)) throw new Error('Selected title no longer exists.');
      if (old && old.titleId !== value.titleId && d.assignments.some((a) => a.kitId === old.id)) throw new Error('Cannot change the title of a kit with assignments.');
      const identifiersToCheck = [value.barcode, ...value.components].map((s) => s.toLowerCase());
      const existing = d.kits.filter((k) => k.id !== value.id).flatMap((k) => [k.barcode, ...k.components]).map((s) => s.toLowerCase());
      if (new Set(identifiersToCheck).size !== identifiersToCheck.length || identifiersToCheck.some((s) => existing.includes(s))) throw new Error('Kit and copy barcodes must be unique.');
      return { ...d, kits: [...d.kits.filter((k) => k.id !== value.id), value] };
    }).then(() => { editKit(blankKit(data.library.branches[0] ?? '')); setMessage('Kit saved.'); }).catch(() => undefined);
  }
  return <Page title="Catalog & kits">
    <Field label="Search titles, authors or kit barcode" value={query} onChangeText={setQuery} />
    {data.titles.filter((t) => !search || `${t.name} ${t.author} ${t.isbn}`.toLowerCase().includes(search) || data.kits.some((k) => k.titleId === t.id && [k.barcode, ...k.components].some((b) => b.toLowerCase().includes(search)))).map((item) =>
      <Card key={item.id}><Label>{item.name}</Label><Note>{item.author} {item.isbn ? `· ISBN ${item.isbn}` : ''}</Note>
        <Note>{item.genres || 'No genres'} · {item.pages || 'Unknown'} pages · {item.largePrint ? 'Large print' : 'No large print'} · {item.audio ? 'Audio available' : 'No audio'}</Note>
        {item.notes ? <Text>Content notes: {item.notes}</Text> : null}
        {staff && <Action title="Edit title" onPress={() => editTitle(item)} />}
        {data.kits.filter((k) => k.titleId === item.id).map((value) => <React.Fragment key={value.id}><Text>{value.barcode} · {value.branch} · {value.copies} copies · {value.status}{value.extras ? ` · ${value.extras}` : ''}</Text>
          {value.components.length > 0 && <Note>Copies: {value.components.join(', ')}</Note>}
          {staff && <Action title={`Edit ${value.barcode}`} onPress={() => editKit(value)} />}
        </React.Fragment>)}
      </Card>)}
    {staff && <><Card><Label>{title.id ? 'Edit title' : 'Add title'}</Label>
      <Field label="Title" value={title.name} onChangeText={(name) => setTitle({ ...title, name })} /><Field label="Author" value={title.author} onChangeText={(author) => setTitle({ ...title, author })} />
      <Field label="ISBN" value={title.isbn} onChangeText={(isbn) => setTitle({ ...title, isbn })} /><Field label="Pages" value={pages} onChangeText={setPages} />
      <Field label="Genres" value={title.genres} onChangeText={(genres) => setTitle({ ...title, genres })} /><Field label="Content notes" value={title.notes} onChangeText={(notes) => setTitle({ ...title, notes })} />
      <Actions><Action title={`Large print: ${title.largePrint ? 'yes' : 'no'}`} onPress={() => setTitle({ ...title, largePrint: !title.largePrint })} /><Action title={`Audio: ${title.audio ? 'yes' : 'no'}`} onPress={() => setTitle({ ...title, audio: !title.audio })} /></Actions>
      <Actions><Action title="Save title" onPress={saveTitle} /><Action title="Clear title form" onPress={() => editTitle(blankTitle())} /></Actions>
    </Card><Card><Label>{kit.id ? 'Edit kit' : 'Add physical kit'}</Label><Note>Select the title:</Note><Actions>{data.titles.map((t) => <Action key={t.id} title={`${t.name}${kit.titleId === t.id ? ' ✓' : ''}`} onPress={() => setKit({ ...kit, titleId: t.id })} />)}</Actions>
      <Field label="Kit barcode" value={kit.barcode} onChangeText={(barcode) => setKit({ ...kit, barcode })} /><Field label="Branch" value={kit.branch} onChangeText={(branch) => setKit({ ...kit, branch })} />
      <Field label="Number of copies" value={copies} onChangeText={setCopies} /><Field label="Extras" value={kit.extras} onChangeText={(extras) => setKit({ ...kit, extras })} />
      <Field label="Copy barcodes (comma separated)" value={components} onChangeText={setComponents} /><Actions><Action title="Save kit" onPress={saveKit} /><Action title="Clear kit form" onPress={() => editKit(blankKit(data.library.branches[0] ?? ''))} /></Actions>
    </Card>{message ? <Text>{message}</Text> : null}</>}
  </Page>;
}
