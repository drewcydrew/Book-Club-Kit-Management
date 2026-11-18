import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { filterOptions, type PickerOption } from '../domain/search';
import { Action, Actions, Label, Note, styles as uiStyles } from './ui';

type SearchPickerProps = {
  label: string;
  options: PickerOption[];
  selectedId: string;
  groups: { value: string; label: string }[];
  disabled?: boolean;
  summary?: string;
  feedback?: string;
  closeOnSelect?: boolean;
  onSelect: (id: string) => void;
};

export function SearchPicker({ label, options, selectedId, groups, disabled, summary, feedback, closeOnSelect = true, onSelect }: SearchPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  return <View style={{ gap: 5 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`Opens the list of ${label.toLowerCase()}`} disabled={disabled}
      onPress={() => setOpen(true)} style={({ pressed }) => [uiStyles.input, styles.field, pressed && uiStyles.pressed, disabled && uiStyles.disabled]}>
      <Text style={selected ? styles.value : styles.placeholder}>{selected ? selected.label : summary ?? `Select ${label.toLowerCase()}`}</Text>
    </Pressable>
    {open && <Modal transparent visible onRequestClose={() => setOpen(false)} accessibilityLabel={label}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <SearchPickerPanel label={label} options={options} selectedId={selectedId} groups={groups} disabled={disabled} feedback={feedback} closeOnSelect={closeOnSelect} onSelect={onSelect} onClose={() => setOpen(false)} />
      </View></View>
    </Modal>}
  </View>;
}

export function SearchPickerPanel({ label, options, selectedId, groups, disabled, feedback, closeOnSelect = true, onSelect, onClose, closeLabel = 'Close' }: SearchPickerProps & { onClose: () => void; closeLabel?: string }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const matches = useMemo(() => filterOptions(options, query, group), [options, query, group]);
  return <View style={styles.panel}>
          <Label>{label}</Label>
          <TextInput autoFocus accessibilityLabel={`Search ${label.toLowerCase()}`} placeholder="Search by name or role" value={query} onChangeText={setQuery} style={uiStyles.input} />
          <Actions>{groups.map((item) => <Action key={item.value} selected={group === item.value} title={item.label} onPress={() => setGroup(item.value)} />)}</Actions>
          <Note>{matches.length} of {options.length} shown</Note>
          {feedback ? <Text accessibilityLiveRegion="polite">{feedback}</Text> : null}
          <FlatList data={matches} keyExtractor={(option) => option.id} keyboardShouldPersistTaps="handled" style={styles.list}
            ListEmptyComponent={<Note>Nothing matches this search.</Note>}
            renderItem={({ item }) => <Pressable accessibilityRole="button"
              disabled={disabled} accessibilityState={{ selected: item.id === selectedId, disabled }}
              onPress={() => { onSelect(item.id); if (closeOnSelect) onClose(); }} style={({ pressed }) => [styles.row, item.id === selectedId && styles.rowSelected, pressed && uiStyles.pressed, disabled && uiStyles.disabled]}>
              <Text style={styles.rowName}>{item.label}{item.id === selectedId ? ' ✓' : ''}</Text>
              <Note>{item.detail}</Note>
            </Pressable>} />
          <Actions><Action title={closeLabel} onPress={onClose} /></Actions>
  </View>;
}

const styles = StyleSheet.create({
  field: { justifyContent: 'center' },
  value: { color: '#173832', fontSize: 16 },
  placeholder: { color: '#7a8b86', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 650, maxHeight: '90%', backgroundColor: '#fffefa', padding: 20, gap: 12 },
  panel: { flexShrink: 1, gap: 12 },
  list: { flexShrink: 1 },
  row: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#c9d6d1', gap: 2 },
  rowSelected: { backgroundColor: '#d6e5d8' },
  rowName: { color: '#183a36', fontWeight: '600', fontSize: 16 },
});
