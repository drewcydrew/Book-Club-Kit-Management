import React, { useState, useSyncExternalStore } from 'react';
import { Modal, Platform, ScrollView, Text, View } from 'react-native';
import { today } from '../domain/dates';
import { Action, Actions, Label } from './ui';

type MonthFieldProps = { label: string; value: string; onChange: (value: string) => void; editable?: boolean };

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(Date.UTC(2020, index, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' }));

function supportsMonthInput(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const input = document.createElement('input');
  input.type = 'month';
  return input.type === 'month';
}

function subscribeToMonthSupport(): () => void {
  return () => {};
}

function MonthControls({ label, value, onChange, editable = true }: MonthFieldProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const selectedMonth = valid ? Number(value.slice(5, 7)) : 0;
  const selectedYear = valid ? Number(value.slice(0, 4)) : -1;
  const display = valid ? `${monthNames[selectedMonth - 1]} ${value.slice(0, 4)}` : 'Select month';

  function show() {
    setYear(valid ? selectedYear : Number(today().slice(0, 4)));
    setOpen(true);
  }

  return <View style={{ gap: 5 }}>
    <Label>{label}</Label>
    <Actions><Action title={display} accessibilityLabel={`${label}: ${display}`} disabled={!editable} onPress={show} /></Actions>
    <Modal transparent visible={open} onRequestClose={() => setOpen(false)} accessibilityLabel={label}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
        <ScrollView style={{ maxHeight: '90%', backgroundColor: '#fffefa', maxWidth: 600, width: '100%', alignSelf: 'center' }} contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Label>{label}</Label>
          <Actions>
            <Action title="Previous year" accessibilityLabel={`Previous year for ${label}`} disabled={year <= 0} onPress={() => setYear(year - 1)} />
            <Text accessibilityLiveRegion="polite">{String(year).padStart(4, '0')}</Text>
            <Action title="Next year" accessibilityLabel={`Next year for ${label}`} disabled={year >= 9999} onPress={() => setYear(year + 1)} />
          </Actions>
          <Actions>{monthNames.map((name, index) => <Action
            key={name}
            title={name}
            accessibilityLabel={`${label}: ${name} ${String(year).padStart(4, '0')}`}
            selected={selectedYear === year && selectedMonth === index + 1}
            disabled={!editable}
            onPress={() => { onChange(`${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`); setOpen(false); }}
          />)}</Actions>
          <Actions><Action title="Cancel" onPress={() => setOpen(false)} /></Actions>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

export function MonthField(props: MonthFieldProps) {
  const supportsMonth = useSyncExternalStore(subscribeToMonthSupport, supportsMonthInput, () => false);

  if (Platform.OS !== 'web' || !supportsMonth) return <MonthControls {...props} />;
  return <View style={{ gap: 5 }}>
    <Label>{props.label}</Label>
    <input
      type="month"
      aria-label={props.label}
      value={props.value}
      disabled={props.editable === false}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      style={{ border: '1px solid #718b82', padding: '9px 10px', color: '#173832', background: '#fff', minHeight: 44, font: 'inherit' }}
    />
  </View>;
}
