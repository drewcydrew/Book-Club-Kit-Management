import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { Action, Actions, Label, Note, styles as uiStyles } from './ui';

type TitlePickerProps = {
  titles: Title[];
  selectedId: string;
  disabled: boolean;
  onSelect: (titleId: string) => void;
};

export function TitlePicker({ titles, selectedId, disabled, onSelect }: TitlePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = titles.find((title) => title.id === selectedId);
  const sorted = useMemo(() => [...titles].sort((a, b) => a.name.localeCompare(b.name)), [titles]);
  const search = query.trim().toLowerCase();
  const matches = useMemo(() => search
    ? sorted.filter((title) => `${title.name} ${title.author} ${title.isbn}`.toLowerCase().includes(search))
    : sorted, [sorted, search]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(titleId: string) {
    onSelect(titleId);
    close();
  }

  return <View style={{ gap: 5 }}>
    <Label>Title</Label>
    <Pressable accessibilityRole="button" accessibilityLabel="Title" accessibilityHint="Opens the list of titles" disabled={disabled}
      onPress={() => setOpen(true)} style={({ pressed }) => [uiStyles.input, styles.field, pressed && uiStyles.pressed, disabled && uiStyles.disabled]}>
      <View style={styles.fieldRow}>
        {selected && (selected.coverUrl || selected.isbn) && <TitleCover coverUrl={selected.coverUrl} isbn={selected.isbn} style={thumbStyle} />}
        <Text style={selected ? styles.value : styles.placeholder}>{selected ? selected.name : 'Select a title'}</Text>
      </View>
    </Pressable>
    {open && <Modal transparent visible onRequestClose={close} accessibilityLabel="Choose a title">
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Label>Choose a title</Label>
          <TextInput accessibilityLabel="Search titles" placeholder="Search by title, author or ISBN" value={query} onChangeText={setQuery} style={uiStyles.input} />
          <Note>{matches.length} of {titles.length} titles</Note>
          <FlatList data={matches} keyExtractor={(title) => title.id} keyboardShouldPersistTaps="handled" style={styles.list}
            ListEmptyComponent={<Note>No titles match this search.</Note>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === selectedId }}
              onPress={() => choose(item.id)} style={({ pressed }) => [styles.row, item.id === selectedId && styles.rowSelected, pressed && uiStyles.pressed]}>
              <View style={styles.fieldRow}>
                {(item.coverUrl || item.isbn) && <TitleCover coverUrl={item.coverUrl} isbn={item.isbn} style={thumbStyle} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowName}>{item.name}{item.id === selectedId ? ' ✓' : ''}</Text>
                  <Note>{item.author}</Note>
                </View>
              </View>
            </Pressable>} />
          <Actions><Action title="Close" onPress={close} /></Actions>
        </View>
      </View>
    </Modal>}
  </View>;
}

const thumbStyle = { width: 34, height: 50, marginRight: 0 };

const styles = StyleSheet.create({
  field: { justifyContent: 'center' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { color: '#173832', fontSize: 16 },
  placeholder: { color: '#7a8b86', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 650, maxHeight: '90%', backgroundColor: '#fffefa', padding: 20, gap: 12 },
  list: { flexShrink: 1 },
  row: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#c9d6d1', gap: 2 },
  rowSelected: { backgroundColor: '#d6e5d8' },
  rowName: { color: '#183a36', fontWeight: '600', fontSize: 16 },
});
