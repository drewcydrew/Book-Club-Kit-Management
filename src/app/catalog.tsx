import { usePreventRemove } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigationGuard } from '../components/navigation-guard';
import { TitleCover } from '../components/title-cover';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import type { Kit, Title } from '../domain/model';
import { ApiError, deleteRecord, fetchIsbnCover, saveRecord } from '../state/api';
import { saveCatalogChange } from '../state/catalog-save';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const blankTitle = (): Title => ({ id: '', name: '', author: '', isbn: '', pages: 0, genres: '', notes: '', largePrint: false, audio: false, coverUrl: null });
const blankKit = (branch: string): Kit => ({ id: '', titleId: '', barcode: '', branch, copies: 1, extras: '', components: [], status: 'available' });

type TitleDraft = { kind: 'title'; value: Title; pages: string; revision: number | null };
type KitDraft = { kind: 'kit'; value: Kit; copies: string; components: string; revision: number | null };
type Draft = TitleDraft | KitDraft;

function titleDraft(value: Title, revision: number | null): TitleDraft {
  return { kind: 'title', value, pages: value.pages ? String(value.pages) : '', revision };
}
function kitDraft(value: Kit, revision: number | null): KitDraft {
  return { kind: 'kit', value, copies: String(value.copies), components: value.components.join(', '), revision };
}

type CoverPreviewStatus = 'loading' | 'found' | 'none' | 'invalid' | 'error';

function coverPreviewMessage(status: CoverPreviewStatus): string {
  switch (status) {
    case 'loading': return 'Looking up cover…';
    case 'found': return 'Cover found. It will be saved with this title.';
    case 'none': return 'No cover found for this ISBN.';
    case 'invalid': return 'Enter a valid ISBN-10 or ISBN-13 to preview a cover.';
    case 'error': return 'Cover lookup is unavailable right now.';
  }
}

export default function Catalog() {
  const { data } = useStore();
  const shared = useShared();
  const navigationGuard = useNavigationGuard();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState('');
  const [pendingIsbn, setPendingIsbn] = useState('');
  const [preview, setPreview] = useState<{ isbn: string; status: CoverPreviewStatus } | null>(null);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [recovery, setRecovery] = useState<'conflict' | 'uncertain' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const saving = useRef(false);
  const [deleting, setDeleting] = useState<{ kind: 'titles' | 'kits'; id: string; revision: number; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const search = query.trim().toLowerCase();
  const dirty = draft !== null && JSON.stringify(draft) !== initial;
  const busy = shared.saving || refreshing;

  const disablePrevention = usePreventRemove(dirty || (draft !== null && busy), ({ repeat }) => {
    if (busy) {
      setFormError('Wait for the shared change to finish before leaving.');
      return;
    }
    setPendingNavigation(() => repeat);
    setConfirmDiscard(true);
  });

  useEffect(() => {
    if (!draft || (!dirty && !busy)) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) {
        setFormError('Wait for the shared change to finish before leaving.');
        return;
      }
      setPendingNavigation(() => () => { disablePrevention(); continueNavigation(); });
      setConfirmDiscard(true);
    });
  }, [busy, dirty, disablePrevention, draft, navigationGuard]);

  useEffect(() => {
    if (!pendingIsbn) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreview({ isbn: pendingIsbn, status: 'loading' });
      fetchIsbnCover(pendingIsbn).then((imageUrl) => {
        if (cancelled) return;
        setPreview({ isbn: pendingIsbn, status: imageUrl ? 'found' : 'none' });
        // Only apply the cover while the form still holds this ISBN.
        setDraft((current) => current?.kind === 'title' && current.value.isbn.trim() === pendingIsbn
          ? { ...current, value: { ...current.value, coverUrl: imageUrl } } : current);
      }).catch((error: unknown) => {
        if (cancelled) return;
        setPreview({ isbn: pendingIsbn, status: error instanceof ApiError && error.status === 400 ? 'invalid' : 'error' });
      });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pendingIsbn]);

  function open(next: Draft) {
    setDraft(next);
    setInitial(JSON.stringify(next));
    setPendingIsbn('');
    setPreview(null);
    setFormError('');
    setRecovery(null);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    setMessage('');
  }
  function changeIsbn(isbn: string) {
    if (!draft || draft.kind !== 'title') return;
    const trimmed = isbn.trim();
    const changed = trimmed !== draft.value.isbn.trim();
    // A cover belongs to one ISBN, so editing the ISBN drops the previous cover until a new preview arrives.
    setDraft({ ...draft, value: { ...draft.value, isbn, coverUrl: changed ? null : draft.value.coverUrl } });
    if (!changed) return;
    setPendingIsbn(trimmed);
    setPreview(trimmed ? { isbn: trimmed, status: 'loading' } : null);
  }

  function close() {
    if (busy || saving.current) return;
    if (dirty) { setConfirmDiscard(true); return; }
    setDraft(null);
  }
  function discard() {
    const navigate = pendingNavigation;
    setDraft(null);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    if (navigate) navigate();
  }

  async function save() {
    if (!draft || saving.current || shared.saving || recovery) return;
    setFormError('');
    try {
      let operation: () => Promise<unknown>;
      if (draft.kind === 'title') {
        const pages = draft.pages.trim() ? Number(draft.pages) : 0;
        if (!draft.value.name.trim() || !draft.value.author.trim() || !Number.isInteger(pages) || pages < 0) {
          setFormError('Enter a title, author and a nonnegative whole page count.'); return;
        }
        const value = { ...draft.value, name: draft.value.name.trim(), author: draft.value.author.trim(), pages,
          ...(draft.revision === null ? {} : { revision: draft.revision }) };
        operation = () => saveRecord('titles', value);
      } else {
        const copies = Number(draft.copies);
        const components = draft.components.split(',').map((value) => value.trim()).filter(Boolean);
        if (!draft.value.titleId || !draft.value.barcode.trim() || !draft.value.branch.trim() ||
          !Number.isInteger(copies) || copies < 1 || components.length > copies) {
          setFormError('Select a title, enter a barcode and branch, and use a positive copy count at least as large as the component list.'); return;
        }
        const old = data.kits.find((item) => item.id === draft.value.id);
        if (old && old.titleId !== draft.value.titleId && data.assignments.some((item) => item.kitId === draft.value.id)) {
          setFormError('Cannot change the title of a kit referenced by a shared schedule.'); return;
        }
        const { status: _status, ...fields } = draft.value;
        const value = { ...fields, barcode: draft.value.barcode.trim(), branch: draft.value.branch.trim(), copies, components,
          ...(draft.revision === null ? {} : { revision: draft.revision }) };
        operation = () => saveRecord('kits', value);
      }
      saving.current = true;
      const result = await saveCatalogChange(shared.mutate, operation);
      if (!result.ok) {
        setFormError(result.message);
        setRecovery(result.recovery);
        return;
      }
      setDraft(null);
      setMessage(draft.kind === 'title' ? 'Title saved.' : 'Kit saved.');
    } finally {
      saving.current = false;
    }
  }

  function startDelete(value: { kind: 'titles' | 'kits'; id: string; revision: number; name: string }) {
    setDeleteError('');
    setDeleting(value);
  }

  function closeDelete() {
    if (shared.saving) return;
    setDeleting(null);
    setDeleteError('');
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await shared.mutate(() => deleteRecord(deleting.kind, deleting.id, deleting.revision));
      setDeleting(null);
      setMessage('Record deleted.');
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this record.');
    }
  }

  async function refreshAndReload() {
    if (!draft || busy) return;
    setRefreshing(true);
    try {
      await shared.refresh();
      // Refresh completes before React updates the shared context; reload is explicit below.
      setFormError('Shared data refreshed. Close this form and reopen the record to review the latest version.');
      setRecovery('uncertain');
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Unable to refresh shared data.');
    } finally {
      setRefreshing(false);
    }
  }

  return <Page title="Catalog & kits">
    <Actions><Action title="Refresh shared catalog" onPress={() => { void shared.refresh().catch(() => undefined); }} />
      {staff && <><Action tone="primary" title="Add title" onPress={() => open(titleDraft(blankTitle(), null))} />
        <Action tone="primary" title="Add kit" onPress={() => open(kitDraft(blankKit(data.library.branches[0] ?? ''), null))} /></>}
    </Actions>
    <Note>Titles, kits, kit status and circulation are shared across devices.</Note>
    {message ? <Text>{message}</Text> : null}
    <Field label="Search titles, authors or kit barcode" value={query} onChangeText={setQuery} />
    {data.titles.filter((t) => !search || `${t.name} ${t.author} ${t.isbn}`.toLowerCase().includes(search) || data.kits.some((k) => k.titleId === t.id && [k.barcode, ...k.components].some((b) => b.toLowerCase().includes(search)))).map((item) =>
      <Card key={item.id}><View style={{ flexDirection: 'row' }}><TitleCover coverUrl={item.coverUrl} isbn={item.isbn} /><View style={{ flex: 1 }}><Label>{item.name}</Label><Note>{item.author} {item.isbn ? `· ISBN ${item.isbn}` : ''}</Note>
        <Note>{item.genres || 'No genres'} · {item.pages || 'Unknown'} pages · {item.largePrint ? 'Large print' : 'No large print'} · {item.audio ? 'Audio available' : 'No audio'}</Note>
        {item.notes ? <Text>Content notes: {item.notes}</Text> : null}</View></View>
        {staff && <Actions><Action title="Edit title" onPress={() => {
          const record = shared.data.titles.find((title) => title.id === item.id);
          if (record) open(titleDraft(item, record.revision));
          else setMessage('This title is no longer available. Refresh the shared catalog.');
        }} /><Action tone="danger" title="Delete title" onPress={() => {
          const record = shared.data.titles.find((title) => title.id === item.id);
          if (record) startDelete({ kind: 'titles', id: record.id, revision: record.revision, name: record.name });
        }} /></Actions>}
        {data.kits.filter((k) => k.titleId === item.id).map((value) => <React.Fragment key={value.id}><Text>{value.barcode} · {value.branch} · {value.copies} copies · {value.status}{value.extras ? ` · ${value.extras}` : ''}</Text>
          {value.components.length > 0 && <Note>Copies: {value.components.join(', ')}</Note>}
          {staff && <Actions><Action title={`Edit ${value.barcode}`} onPress={() => {
            const record = shared.data.kits.find((kit) => kit.id === value.id);
            if (record) open(kitDraft(value, record.revision));
            else setMessage('This kit is no longer available. Refresh the shared catalog.');
          }} /><Action tone="danger" title={`Delete ${value.barcode}`} onPress={() => {
            const record = shared.data.kits.find((item) => item.id === value.id);
            if (record) startDelete({ kind: 'kits', id: record.id, revision: record.revision, name: record.barcode });
          }} /></Actions>}
        </React.Fragment>)}
      </Card>)}
    {draft && <Modal transparent visible onRequestClose={confirmDiscard ? () => { setConfirmDiscard(false); setPendingNavigation(null); } : close}
      accessibilityLabel={`${draft.value.id ? 'Edit' : 'Add'} ${draft.kind}`}>
      <KeyboardAvoidingView style={modalStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalStyles.dialog}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={modalStyles.content}>
            {confirmDiscard ? <>
              <Label>Discard unsaved changes?</Label><Note>Your changes have not been saved.</Note>
              <Actions><Action tone="danger" title="Discard changes" onPress={discard} /><Action title="Keep editing" onPress={() => { setConfirmDiscard(false); setPendingNavigation(null); }} /></Actions>
            </> : <>
              <Label>{draft.value.id ? `Edit ${draft.kind}` : `Add ${draft.kind}`}</Label>
              {draft.kind === 'title' ? <>
                <Field editable={!shared.saving} label="Title" value={draft.value.name} onChangeText={(name) => setDraft({ ...draft, value: { ...draft.value, name } })} />
                <Field editable={!shared.saving} label="Author" value={draft.value.author} onChangeText={(author) => setDraft({ ...draft, value: { ...draft.value, author } })} />
                <Field editable={!shared.saving} label="ISBN" value={draft.value.isbn} onChangeText={changeIsbn} />
                {draft.value.coverUrl ? <Image source={{ uri: draft.value.coverUrl }} style={modalStyles.preview} accessibilityLabel="Cover preview" resizeMode="contain" /> : null}
                {preview && preview.isbn === draft.value.isbn.trim() ? <Note>{coverPreviewMessage(preview.status)}</Note> : null}
                <Field editable={!shared.saving} label="Pages" value={draft.pages} onChangeText={(pages) => setDraft({ ...draft, pages })} />
                <Field editable={!shared.saving} label="Genres" value={draft.value.genres} onChangeText={(genres) => setDraft({ ...draft, value: { ...draft.value, genres } })} />
                <Field editable={!shared.saving} label="Content notes" value={draft.value.notes} onChangeText={(notes) => setDraft({ ...draft, value: { ...draft.value, notes } })} />
                <Actions><Action disabled={shared.saving} selected={draft.value.largePrint} title={`Large print: ${draft.value.largePrint ? 'yes' : 'no'}`} onPress={() => setDraft({ ...draft, value: { ...draft.value, largePrint: !draft.value.largePrint } })} />
                  <Action disabled={shared.saving} selected={draft.value.audio} title={`Audio: ${draft.value.audio ? 'yes' : 'no'}`} onPress={() => setDraft({ ...draft, value: { ...draft.value, audio: !draft.value.audio } })} /></Actions>
              </> : <>
                <Note>Select the title:</Note><Actions>{data.titles.map((title) => <Action key={title.id} disabled={shared.saving} selected={draft.value.titleId === title.id} title={`${title.name}${draft.value.titleId === title.id ? ' ✓' : ''}`} onPress={() => setDraft({ ...draft, value: { ...draft.value, titleId: title.id } })} />)}</Actions>
                {data.titles.length === 0 && <Note>Add a title before creating a kit.</Note>}
                <Field editable={!shared.saving} label="Kit barcode" value={draft.value.barcode} onChangeText={(barcode) => setDraft({ ...draft, value: { ...draft.value, barcode } })} />
                <Field editable={!shared.saving} label="Branch" value={draft.value.branch} onChangeText={(branch) => setDraft({ ...draft, value: { ...draft.value, branch } })} />
                <Field editable={!shared.saving} label="Number of copies" value={draft.copies} onChangeText={(copies) => setDraft({ ...draft, copies })} />
                <Field editable={!shared.saving} label="Extras" value={draft.value.extras} onChangeText={(extras) => setDraft({ ...draft, value: { ...draft.value, extras } })} />
                <Field editable={!shared.saving} label="Copy barcodes (comma separated)" value={draft.components} onChangeText={(components) => setDraft({ ...draft, components })} />
              </>}
              {formError ? <Text accessibilityRole="alert" style={modalStyles.error}>{formError}</Text> : null}
              {recovery && <><Note>Refresh and inspect the shared catalog before retrying. Close and reopen an existing record to edit the latest version.</Note>
                <Action title="Refresh shared data" disabled={busy} onPress={() => { void refreshAndReload(); }} /></>}
              <Actions><Action tone="primary" title={`Save ${draft.kind}`} disabled={busy || !!recovery} onPress={() => { void save(); }} />
                <Action title="Cancel" disabled={busy} onPress={close} /></Actions>
            </>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>}
    {deleting && <Modal transparent visible onRequestClose={closeDelete} accessibilityLabel={`Delete ${deleting.kind === 'titles' ? 'title' : 'kit'}`}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.dialog}>
          <ScrollView contentContainerStyle={modalStyles.content}>
            <Label>Delete {deleting.name}?</Label>
            <Note>{deleting.kind === 'titles'
              ? 'This removes the title for every user. A title that a kit or shared schedule still uses cannot be deleted until those are removed.'
              : 'This removes the kit for every user. A kit that a shared schedule still uses cannot be deleted until it is removed from that schedule.'}</Note>
            {deleteError ? <Text accessibilityRole="alert" style={modalStyles.error}>{deleteError}</Text> : null}
            <Actions><Action tone="danger" title="Confirm deletion" disabled={shared.saving} onPress={() => { void confirmDelete(); }} />
              <Action title="Cancel deletion" disabled={shared.saving} onPress={closeDelete} /></Actions>
          </ScrollView>
        </View>
      </View>
    </Modal>}
  </Page>;
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 650, maxHeight: '90%', backgroundColor: '#fffefa' },
  content: { padding: 20, gap: 12 },
  preview: { width: 96, height: 144, borderRadius: 4, alignSelf: 'flex-start' },
  error: { color: '#a22525', fontWeight: '600' },
});
