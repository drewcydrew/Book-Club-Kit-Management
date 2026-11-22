import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { today, validDate } from '../domain/dates';
import { Action, Actions, Label } from './ui';

export type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  optional?: boolean;
  initialDate?: string;
};

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, month - 1, day);
  return date;
}

function dateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DateField({ label, value, onChange, editable = true, optional = false, initialDate }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => localDate(today()));
  const [error, setError] = useState('');
  const androidOpen = useRef(false);

  useEffect(() => () => {
    if (androidOpen.current) void DateTimePickerAndroid.dismiss('date').catch((error: unknown) => console.error('Unable to dismiss the date picker:', error));
  }, []);

  function show() {
    const initial = validDate(value) ? value : initialDate && validDate(initialDate) ? initialDate : today();
    const selected = localDate(initial);
    setError('');
    if (Platform.OS === 'android') {
      androidOpen.current = true;
      DateTimePickerAndroid.open({
        value: selected,
        mode: 'date',
        onValueChange: (_event, date) => { androidOpen.current = false; onChange(dateValue(date)); },
        onDismiss: () => { androidOpen.current = false; },
        onError: () => { androidOpen.current = false; setError('Unable to open the date picker.'); },
      });
    } else {
      setDraft(selected);
      setOpen(true);
    }
  }

  return <View style={{ gap: 5 }}>
    <Label>{label}</Label>
    <Actions>
      <Action title={value || 'Select date'} accessibilityLabel={`${label}: ${value || 'no date selected'}`} disabled={!editable} onPress={show} />
      {optional && !!value && <Action title="Clear date" accessibilityLabel={`Clear ${label}`} disabled={!editable} onPress={() => onChange('')} />}
    </Actions>
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
    {Platform.OS === 'ios' && <Modal transparent visible={open} onRequestClose={() => setOpen(false)} accessibilityLabel={label}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fffefa', padding: 20, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          <Label>{label}</Label>
          <DateTimePicker value={draft} mode="date" display="spinner" onValueChange={(_event, date) => setDraft(date)} />
          <Actions>
            <Action tone="primary" title="Confirm date" disabled={!editable} onPress={() => { onChange(dateValue(draft)); setOpen(false); }} />
            <Action title="Cancel" onPress={() => setOpen(false)} />
          </Actions>
        </View>
      </View>
    </Modal>}
  </View>;
}
