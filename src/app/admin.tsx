import { router, usePreventRemove } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigationGuard } from '../components/navigation-guard';
import { SearchPicker } from '../components/search-picker';
import { LibraryServiceSetup } from '../components/library-service-setup';
import { Action, Actions, Card, Field, Label, Note, Page, styles as uiStyles } from '../components/ui';
import { id } from '../domain/logic';
import type { Library, Person, Role } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { deleteUser, previewLibraryServiceDeletion, saveSettings, saveUser, type ServiceDeletionPreview } from '../state/api';
import { useShared, useSharedStatus } from '../state/shared';
import { useStore } from '../state/store';
import { ScreenGate } from '../components/screen-gate';
import { useAuth } from '../state/auth';
import { useLibraryService } from '../state/library-service';
import { useSelection } from '../state/selection';

const roles: Role[] = ['member', 'staff', 'admin'];
const roleGroups = [{ value: 'all', label: 'All roles' }, ...roles.map((role) => ({ value: role, label: role }))];

function userSnapshot(name: string, role: Role) {
  return JSON.stringify({ name, role });
}

export default function Admin() {
  const { user } = useAuth();
  const { service } = useLibraryService();
  const { person, loading, error, refreshUsers } = useSelection();
  if (user && (!service || !person)) return <ScrollView keyboardShouldPersistTaps="handled">
    <View style={uiStyles.page}>
      <Text accessibilityRole="header" style={uiStyles.heading}>Admin</Text>
      <LibraryServiceSetup />
      {service && loading && <Note>Loading administrator access...</Note>}
      {service && error && <><Text style={uiStyles.error}>{error}</Text>
        <Action title="Retry" onPress={() => { void refreshUsers().catch(() => undefined); }} /></>}
    </View>
  </ScrollView>;
  return <ScreenGate staffOnly><AdminContent /></ScreenGate>;
}

function AdminContent() {
  const { data } = useStore();
  const shared = useShared();
  const { user } = useAuth();
  const { service } = useLibraryService();
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<Role>('member');
  const [editing, setEditing] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [message, setMessage] = useState('');
  const [managedId, setManagedId] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const managed = data.people.find((p) => p.id === managedId);
  const canManage = person?.role === 'admin';
  const personOptions = useMemo<PickerOption[]>(() => data.people.map((value) => ({ id: value.id, label: `${value.name} · ${value.firebaseManaged ? 'Firebase account' : value.role}`, detail: value.role, group: value.role })), [data.people]);
  const navigationGuard = useNavigationGuard();
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [initial, setInitial] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const dirty = formOpen && userSnapshot(userName, userRole) !== initial;
  const busy = shared.saving;

  const disablePrevention = usePreventRemove(dirty || (formOpen && busy), ({ repeat }) => {
    if (busy) {
      setFormError('Wait for the shared change to finish before leaving.');
      return;
    }
    setPendingNavigation(() => repeat);
    setConfirmDiscard(true);
  });

  useEffect(() => {
    if (!formOpen || (!dirty && !busy)) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) {
        setFormError('Wait for the shared change to finish before leaving.');
        return;
      }
      setPendingNavigation(() => () => { disablePrevention(); continueNavigation(); });
      setConfirmDiscard(true);
    });
  }, [busy, dirty, disablePrevention, formOpen, navigationGuard]);

  function openUserForm(value?: Person) {
    const name = value?.name ?? '';
    const role = value?.role ?? 'member';
    setEditing(value ?? null);
    setUserName(name);
    setUserRole(role);
    setInitial(userSnapshot(name, role));
    setFormError('');
    setConfirmDiscard(false);
    setPendingNavigation(null);
    setMessage('');
    setFormOpen(true);
  }

  function closeUserForm() {
    if (busy) return;
    if (dirty) { setConfirmDiscard(true); return; }
    setFormOpen(false);
  }

  function discardUserForm() {
    const navigate = pendingNavigation;
    setFormOpen(false);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    if (navigate) navigate();
  }

  function savePerson() {
    if (!userName.trim()) { setFormError('Enter a fictional user name.'); return; }
    const value = editing
      ? { id: editing.id, name: userName.trim(), role: userRole, revision: editing.revision }
      : { id: id(), name: userName.trim(), role: userRole };
    setFormError('');
    void shared.mutate(() => saveUser(value))
      .then(() => {
        setFormOpen(false);
        setEditing(null);
        setMessage(editing ? 'Shared user updated.' : 'Shared user created.');
      })
      .catch((error: unknown) => setFormError(error instanceof Error ? error.message : 'Unable to save user.'));
  }

  function removePerson(value: Person) {
    void shared.mutate(() => deleteUser(value.id, value.revision))
      .then(() => {
        setDeleting(null);
        setManagedId('');
        setMessage('User deleted.');
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to delete user.'));
  }

  if (!canManage) return <Page title="Admin">
    <Card>
      <Label>Admin controls</Label>
      <Note>{person ? 'Sign in on Home to manage users and lending settings.' : 'Choose a user on Home.'}</Note>
    </Card>
    {message ? <Text>{message}</Text> : null}
  </Page>;

  return <Page title="Admin">
    {user && <LibraryServiceSetup />}
    <Card>
      <Label>Shared users · {data.people.length} users</Label>
      <Note>Firebase accounts are managed in Firebase. Demo roles do not grant sign-in access.</Note>
      <Actions><Action tone="primary" title="Add user" disabled={busy} onPress={() => openUserForm()} /></Actions>
      <SearchPicker label="Shared user" options={personOptions} selectedId={managedId} groups={roleGroups} summary="Select a user to edit or delete" disabled={busy}
        onSelect={(value) => { setManagedId(value); setDeleting(null); }} />
      {managed && <Actions>
        {managed.firebaseManaged ? <Note>Firebase accounts are managed in Firebase.</Note> : <Action title="Edit" disabled={busy} onPress={() => openUserForm(managed)} />}
        {!managed.firebaseManaged && <Action tone="danger" title="Delete" disabled={busy} onPress={() => setDeleting(managed)} />}
      </Actions>}
      {deleting && <><Note>Delete {deleting.name}? Existing preferences, memberships and history may restrict deletion.</Note>
        <Actions><Action tone="danger" title="Confirm delete" onPress={() => removePerson(deleting)} /><Action title="Cancel" onPress={() => setDeleting(null)} /></Actions></>}
    </Card>
    {formOpen && <Modal transparent visible onRequestClose={confirmDiscard ? () => { setConfirmDiscard(false); setPendingNavigation(null); } : closeUserForm}
      accessibilityLabel={editing ? 'Edit user' : 'Add user'}>
      <KeyboardAvoidingView style={modalStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalStyles.dialog}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={modalStyles.content}>
            {confirmDiscard ? <>
              <Label>Discard unsaved changes?</Label><Note>Your changes have not been saved.</Note>
              <Actions><Action tone="danger" title="Discard changes" onPress={discardUserForm} />
                <Action title="Keep editing" onPress={() => { setConfirmDiscard(false); setPendingNavigation(null); }} /></Actions>
            </> : <>
              <Label>{editing ? 'Edit shared user' : 'Add shared user'}</Label>
              <Field editable={!busy} label={editing ? 'Edit user name' : 'New fictional user name'} value={userName} onChangeText={setUserName} />
              <Label>Demo role</Label><Actions>{roles.map((role) => <Action key={role} disabled={busy} selected={userRole === role} title={`${role}${userRole === role ? ' ✓' : ''}`} onPress={() => setUserRole(role)} />)}</Actions>
              {formError ? <Text accessibilityRole="alert" style={modalStyles.error}>{formError}</Text> : null}
              <Actions><Action tone="primary" title={editing ? 'Save user' : 'Create user'} disabled={busy} onPress={savePerson} />
                <Action title="Cancel" disabled={busy} onPress={closeUserForm} /></Actions>
            </>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>}

    <SharedLibrarySettings key={data.library.revision} library={data.library} />
    {user && service && <LibraryServiceDeletion key={service.id} serviceId={service.id} />}
    {message ? <Text>{message}</Text> : null}
  </Page>;
}

function LibraryServiceDeletion({ serviceId }: { serviceId: string }) {
  const library = useLibraryService();
  const { saving } = useSharedStatus();
  const [preview, setPreview] = useState<ServiceDeletionPreview | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function loadPreview() {
    setBusy(true); setMessage('');
    void previewLibraryServiceDeletion(serviceId).then((value) => { setPreview(value); setName(''); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to preview deletion.'))
      .finally(() => setBusy(false));
  }
  function remove() {
    if (!preview) return;
    setBusy(true); setMessage('');
    void library.remove(preview).then(() => router.replace('/')).catch((error: unknown) => {
      setPreview(null);
      setMessage(`${error instanceof Error ? error.message : 'Unable to delete the service.'} Refresh the service list and review again before retrying.`);
    }).finally(() => setBusy(false));
  }

  return <Card><Label>Delete this library service</Label>
    <Note>Any signed-in administrator can permanently delete a service. Its titles, kits, clubs, members, votes, schedules and circulation history will be destroyed. Firebase accounts are not deleted. A backup is required for recovery.</Note>
    {!preview ? <Action title="Review service deletion" tone="danger" disabled={busy || saving} onPress={loadPreview} /> : <>
      <Note>Deleting {preview.service.name} can remove active loan information and is not a production-safe circulation workflow.</Note>
      {Object.entries(preview.counts).filter(([, count]) => count > 0).map(([table, count]) =>
        <Text key={table}>{table.replace(/_/g, ' ')}: {count}</Text>)}
      <Field label="Type the exact service name to delete" value={name} onChangeText={setName} editable={!busy} />
      <Actions><Action title="Permanently delete service" tone="danger" disabled={busy || saving || name !== preview.service.name} onPress={remove} />
        <Action title="Cancel deletion" disabled={busy} onPress={() => { setPreview(null); setName(''); }} /></Actions>
    </>}
    {message ? <Text accessibilityLiveRegion="polite" style={uiStyles.error}>{message}</Text> : null}
    {message ? <Action title="Refresh service list" disabled={busy} onPress={() => {
      void library.refresh().then(() => setMessage('Service list refreshed.')).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to refresh services.'));
    }} /> : null}
  </Card>;
}

function SharedLibrarySettings({ library }: { library: Library }) {
  const shared = useShared();
  const [name, setName] = useState(library.name);
  const [branches, setBranches] = useState(library.branches.join(', '));
  const [loan, setLoan] = useState(String(library.loanDays));
  const [buffer, setBuffer] = useState(String(library.bufferDays));
  const [message, setMessage] = useState('');
  function save() {
    const loanDays = Number(loan), bufferDays = Number(buffer);
    const branchList = branches.split(',').map((branch) => branch.trim()).filter(Boolean);
    if (!name.trim() || branchList.length === 0 || !Number.isInteger(loanDays) || loanDays < 1 ||
        !Number.isInteger(bufferDays) || bufferDays < 0) {
      setMessage('Enter a library name, at least one branch, a positive loan length and a nonnegative buffer.');
      return;
    }
    void shared.mutate(() => saveSettings({ ...library, name: name.trim(), branches: branchList, loanDays, bufferDays }))
      .then(() => setMessage('Shared settings saved.'))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to save settings.'));
  }
  return <Card><Label>Shared library and lending settings</Label>
    <Note>The server rejects turnaround buffers that conflict with existing assignments. Discard the schedules of the affected cycles on Cycles to clear them. Existing assignments keep their original loan dates.</Note>
    <Field label="Library name" value={name} onChangeText={setName} />
    <Field label="Branches (comma separated)" value={branches} onChangeText={setBranches} />
    <Field label="Loan length in days" value={loan} onChangeText={setLoan} />
    <Field label="Turnaround buffer in days" value={buffer} onChangeText={setBuffer} />
    <Action tone="primary" title="Save shared settings" disabled={shared.saving} onPress={save} />
    {message ? <Text>{message}</Text> : null}
  </Card>;
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 650, maxHeight: '90%', backgroundColor: '#fffefa' },
  content: { padding: 20, gap: 12 },
  error: { color: '#a22525', fontWeight: '600' },
});
