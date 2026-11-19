import { useState } from 'react';
import { Text, View } from 'react-native';
import type { KitLabel } from '../domain/model';
import { deleteKitLabel, previewKitLabelDeletion, saveKitLabel, type KitLabelDeletionPreview } from '../state/api';
import { useShared } from '../state/shared';
import { Action, Actions, Card, Field, Label, Note } from './ui';

export function KitLabelManager({ labels }: { labels: KitLabel[] }) {
  const shared = useShared();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<KitLabel['category']>('genre');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<KitLabel | null>(null);
  const [preview, setPreview] = useState<KitLabelDeletionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) { setError('Enter a label name.'); return; }
    setBusy(true); setError('');
    try {
      await shared.mutate(() => saveKitLabel(editing ? { ...editing, name: name.trim() } : { category, name: name.trim() }));
      setName(''); setEditing(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the label.');
    } finally { setBusy(false); }
  }

  async function requestDelete(label: KitLabel) {
    setBusy(true); setError(''); setPreview(null);
    try { setPreview(await previewKitLabelDeletion(label)); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Unable to review label deletion.'); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      await shared.mutate(() => deleteKitLabel(preview));
      if (editing?.id === preview.label.id) { setEditing(null); setName(''); }
      setPreview(null);
    } catch (cause: unknown) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'Unable to delete the label.');
    } finally { setBusy(false); }
  }

  return <Card>
    <Action title={open ? 'Hide genre and vibe management' : 'Manage genres and vibes'} onPress={() => setOpen(!open)} />
    {open && <>
      <Note>Keep these shared title labels concise. ISBNdb source genres are separate.</Note>
      <Actions>{(['genre', 'vibe'] as const).map((value) =>
        <Action key={value} title={value === 'genre' ? 'Genres' : 'Book-club vibes'} selected={category === value} disabled={busy || shared.saving}
          onPress={() => { setCategory(value); setEditing(null); setName(''); setPreview(null); setError(''); }} />)}</Actions>
      <Field label={editing ? 'Rename label' : 'New label'} value={name} onChangeText={setName} editable={!busy && !shared.saving} />
      <Actions><Action title={editing ? 'Save label name' : 'Add label'} disabled={busy || shared.saving} onPress={() => { void save(); }} />
        {editing && <Action title="Cancel label edit" disabled={busy || shared.saving} onPress={() => { setEditing(null); setName(''); setError(''); }} />}</Actions>
      {labels.filter((label) => label.category === category).length === 0 && <Note>No labels in this list yet.</Note>}
      {labels.filter((label) => label.category === category).map((label) => <View key={label.id} style={{ gap: 4 }}>
        <Label>{label.name}</Label>
        <Actions><Action title={`Rename ${label.name}`} disabled={busy || shared.saving}
          onPress={() => { setEditing(label); setName(label.name); setPreview(null); setError(''); }} />
        <Action tone="danger" title={`Delete ${label.name}`} disabled={busy || shared.saving} onPress={() => { void requestDelete(label); }} /></Actions>
      </View>)}
      {preview && <Card>
        <Note>Delete “{preview.label.name}” and remove it from {preview.titleCount} {preview.titleCount === 1 ? 'title' : 'titles'}? Titles, kits and schedules will not be deleted.</Note>
        <Actions><Action tone="danger" title="Confirm label deletion" disabled={busy || shared.saving} onPress={() => { void confirmDelete(); }} />
          <Action title="Keep label" disabled={busy || shared.saving} onPress={() => setPreview(null)} /></Actions>
      </Card>}
      {error ? <Text accessibilityRole="alert" style={{ color: '#a22525' }}>{error}</Text> : null}
      {(error || shared.error) && <Action title="Refresh labels" disabled={busy || shared.saving} onPress={() => {
        setBusy(true); setError('');
        void shared.refresh().then(() => { setEditing(null); setName(''); setPreview(null); })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to refresh labels.')).finally(() => setBusy(false));
      }} />}
    </>}
  </Card>;
}
