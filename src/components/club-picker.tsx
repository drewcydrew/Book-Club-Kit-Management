import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { filterClubs, sortClubs, type ClubListItem, type ClubSortOrder } from '../domain/club-list';
import { Action, Actions, Note, styles as uiStyles } from './ui';

export function ClubPicker<T extends ClubListItem>({ clubs, onPress, isSelected, disabled = false }: {
  clubs: readonly T[]; onPress: (club: T) => void; isSelected?: (club: T) => boolean; disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ClubSortOrder>('az');
  const visible = useMemo(() => sortClubs(filterClubs(clubs, query), order), [clubs, query, order]);

  return <View style={styles.picker}>
    <TextInput accessibilityLabel="Search clubs" placeholder="Search by club or branch" value={query} onChangeText={setQuery}
      autoCapitalize="none" autoCorrect={false} style={uiStyles.input} />
    <Actions>
      <Action title={order === 'az' ? 'Sort Z to A' : 'Sort A to Z'} onPress={() => setOrder(order === 'az' ? 'za' : 'az')} />
      <Note>{`Showing ${visible.length} of ${clubs.length} ${clubs.length === 1 ? 'club' : 'clubs'}`}</Note>
    </Actions>
    {visible.length === 0 && clubs.length > 0 ? <Note>No clubs match “{query.trim()}”.</Note> : null}
    <View style={styles.list}>
      {visible.map((club) => {
        const selected = isSelected?.(club);
        return <Pressable key={club.id} accessibilityRole="button" accessibilityLabel={`${club.name}, ${club.branch}`}
          accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled}
          onPress={() => onPress(club)}
          style={({ pressed }) => [styles.row, selected && styles.selectedRow, pressed && uiStyles.pressed, disabled && uiStyles.disabled]}>
          <Text style={[styles.name, selected && styles.selectedName]}>{club.name}</Text>
          <Text style={styles.branch}>{club.branch}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
  list: { gap: 6 },
  row: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#65877b', paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, gap: 2 },
  selectedRow: { backgroundColor: '#d6e5d8', borderColor: '#245e51', borderLeftWidth: 4 },
  name: { color: '#244c40', fontWeight: '700', fontSize: 15 },
  selectedName: { color: '#183a36' },
  branch: { color: '#465c56', fontSize: 13 },
});
