import { usePreventRemove } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigationGuard } from '../components/navigation-guard';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { id } from '../domain/logic';
import type { Library, Person, Role } from '../domain/model';
import { deleteUser, saveSettings, saveUser } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const roles: Role[] = ['member', 'staff', 'admin'];

function userSnapshot(name: string, role: Role) {
  return JSON.stringify({ name, role });
}

export default function Settings() {
  const { data, update, reset } = useStore();
  const shared = useShared();
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<Role>('member');
  const [editing, setEditing] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const canManageUsers = person?.role === 'admin';
  const canManageSettings = person?.role === 'admin';
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

  function choosePerson(idValue: string) {
    void update((d) => ({ ...d, selectedPersonId: idValue })).then(() => setMessage('Selected demo user saved on this device.')).catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : 'Unable to save selected user.'));
  }

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
      .then(async () => {
        if (data.selectedPersonId === value.id) await update((d) => ({ ...d, selectedPersonId: '' }));
        setDeleting(null);
        setMessage('User deleted.');
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to delete user.'));
  }

  const visibleClubs = person && person.role === 'member'
    ? data.clubs.filter((club) => data.memberships.some((membership) => membership.personId === person.id && membership.clubId === club.id))
    : data.clubs;

  return <Page title="Settings">
    <Card><Label>Demo user</Label>
      <Note>Roles only change the interface. There is no authentication or authorization; anyone with API access can change shared demo data. Use fictional information only.</Note>
      {data.people.length === 0 && <Note>No shared users are available. Run the server demo seed, or create an admin through the API if the seed was already run.</Note>}
      {data.people.length > 0 && !data.people.some((value) => value.role === 'admin') && <Note>No administrator exists. The demo seed creates one only on its first run; if already seeded, restore an admin through the API.</Note>}
      <Actions>{data.people.map((value) => <Action key={value.id} selected={value.id === person?.id} title={`${value.name} · ${value.role}${value.id === person?.id ? ' ✓' : ''}`} onPress={() => choosePerson(value.id)} />)}</Actions>
      <Label>Selected club (this device)</Label>
      {visibleClubs.length === 0 ? <Note>{person?.role === 'member' ? 'This user has no club memberships.' : 'No clubs are available.'}</Note> : <Actions>
        {visibleClubs.map((club) => <Action key={club.id} selected={data.selectedClubId === club.id} title={`${club.name}${data.selectedClubId === club.id ? ' ✓' : ''}`} onPress={() => {
          void update((d) => ({ ...d, selectedClubId: club.id })).then(() => setMessage('Selected club saved on this device.')).catch((error: unknown) =>
            setMessage(error instanceof Error ? error.message : 'Unable to save selected club.'));
        }} />)}
      </Actions>}
    </Card>

    {canManageUsers && <Card><Label>Shared demo users</Label>
      <Note>Creating the first admin is an explicit server seed operation; users are not seeded by the app.</Note>
      <Actions><Action tone="primary" title="Add user" disabled={busy} onPress={() => openUserForm()} /></Actions>
      {data.people.map((value) => <Actions key={value.id}>
        <Text>{value.name} · {value.role}</Text>
        <Action title="Edit" onPress={() => openUserForm(value)} />
        <Action tone="danger" title="Delete" onPress={() => setDeleting(value)} />
      </Actions>)}
      {deleting && <><Note>Delete {deleting.name}? Existing preferences, memberships and history may restrict deletion.</Note>
        <Actions><Action tone="danger" title="Confirm delete" onPress={() => removePerson(deleting)} /><Action title="Cancel" onPress={() => setDeleting(null)} /></Actions></>}
    </Card>}
    {canManageUsers && formOpen && <Modal transparent visible onRequestClose={confirmDiscard ? () => { setConfirmDiscard(false); setPendingNavigation(null); } : closeUserForm}
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

    {canManageSettings && <SharedLibrarySettings key={data.library.revision} library={data.library} />}

    <Card><Label>Device-local selection</Label>
      <Note>Only your selected demo user and club are stored on this device. Previous local users, ballots, cycles, schedules and circulation are not imported. Reset does not delete shared data.</Note>
      {confirmReset ? <Actions><Action tone="danger" title="Confirm reset selections" onPress={() => { void reset(); setConfirmReset(false); }} /><Action title="Cancel" onPress={() => setConfirmReset(false)} /></Actions>
        : <Action title="Reset local selections" onPress={() => setConfirmReset(true)} />}
    </Card>
    {message ? <Text>{message}</Text> : null}
  </Page>;
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
    <Note>The server rejects turnaround buffers that conflict with existing assignments. Existing assignments keep their original loan dates.</Note>
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
