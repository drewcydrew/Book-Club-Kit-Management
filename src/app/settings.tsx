import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { useStore } from '../state/store';

export default function Settings() {
  const { data, update, reset } = useStore();
  const [name, setName] = useState(data.library.name);
  const [loan, setLoan] = useState(String(data.library.loanDays));
  const [buffer, setBuffer] = useState(String(data.library.bufferDays));
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  function save() {
    const loanDays = Number(loan), bufferDays = Number(buffer);
    if (!name.trim() || !Number.isInteger(loanDays) || loanDays < 1 || !Number.isInteger(bufferDays) || bufferDays < 0) {
      setMessage('Enter a library name, a positive whole-number loan length and a nonnegative whole-number buffer.'); return;
    }
    void update((d) => ({ ...d, library: { ...d.library, name: name.trim(), loanDays, bufferDays } })).then(() => setMessage('Settings saved.')).catch(() => undefined);
  }
  return <Page title="Settings">
    <Card><Label>Demo person</Label><Note>These roles change the interface only. Anyone using this device can switch roles.</Note>
      <Actions>{data.people.map((p) => <Action key={p.id} title={`${p.name}${p.id === person?.id ? ' ✓' : ''}`} onPress={() => { void update((d) => ({ ...d, selectedPersonId: p.id })).catch(() => undefined); }} />)}</Actions>
    </Card>
    {person?.role === 'admin' && <Card><Label>Library and policy</Label>
      <Field label="Library name" value={name} onChangeText={setName} />
      <Field label="Loan length in days" value={loan} onChangeText={setLoan} />
      <Field label="Turnaround buffer in days" value={buffer} onChangeText={setBuffer} />
      {message ? <Text>{message}</Text> : null}
      <Action title="Save settings" onPress={save} />
    </Card>}
    <Card><Label>Reset local demo</Label><Note>This permanently replaces local settings, members and schedules with fictional sample data. Shared clubs and kits are not reset.</Note>
      {confirm ? <Actions><Action title="Confirm reset" onPress={() => { void reset(); setConfirm(false); }} /><Action title="Cancel" onPress={() => setConfirm(false)} /></Actions> : <Action title="Reset demo" onPress={() => setConfirm(true)} />}
    </Card>
  </Page>;
}
