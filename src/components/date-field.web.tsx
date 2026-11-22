import React from 'react';
import { View } from 'react-native';
import { Action, Actions, Label } from './ui';
import type { DateFieldProps } from './date-field';

export function DateField({ label, value, onChange, editable = true, optional = false }: DateFieldProps) {
  return <View style={{ gap: 5 }}>
    <Label>{label}</Label>
    <input
      type="date"
      aria-label={label}
      value={value}
      disabled={!editable}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={{ border: '1px solid #718b82', padding: '9px 10px', color: '#173832', background: '#fff', minHeight: 44, font: 'inherit' }}
    />
    {optional && !!value && <Actions><Action title="Clear date" accessibilityLabel={`Clear ${label}`} disabled={!editable} onPress={() => onChange('')} /></Actions>}
  </View>;
}
