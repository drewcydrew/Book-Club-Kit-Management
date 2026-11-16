import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Mark, Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { Action } from './ui';

const markLabels: Record<Mark, string> = { selected: 'Selected', read: 'Already read', wont: 'Won’t read' };

export function TitleCard({ title, mark, width, disabled, onToggleSelect, onDismiss, onRestore }: {
  title: Title; mark?: Mark; width: DimensionValue; disabled: boolean;
  onToggleSelect: () => void; onDismiss: () => void; onRestore: () => void;
}) {
  const hidden = mark === 'wont' || mark === 'read';
  const selected = mark === 'selected';
  const coverDisabled = disabled || hidden;
  return <View style={[styles.wrap, { width }]}>
    <View style={[styles.card, selected && styles.selectedCard, hidden && styles.hiddenCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${title.name}`}
        accessibilityState={{ disabled: coverDisabled, selected }}
        disabled={coverDisabled}
        onPress={onToggleSelect}
        style={({ pressed }) => [styles.coverWrap, pressed && !coverDisabled && styles.pressed]}>
        <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={styles.cover} />
        {selected && <View style={styles.badge}><Text style={styles.badgeText}>✓ Selected</Text></View>}
        {hidden && mark && <View style={styles.badge}><Text style={styles.badgeText}>{markLabels[mark]}</Text></View>}
      </Pressable>
      <Text numberOfLines={1} style={styles.name}>{title.name}</Text>
      {hidden
        ? <Action title="Restore" disabled={disabled} onPress={onRestore} />
        : <Action title="Won’t read" disabled={disabled} onPress={onDismiss} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { padding: 3 },
  card: { backgroundColor: '#fffefa', borderWidth: 2, borderColor: 'transparent', padding: 4, gap: 4 },
  selectedCard: { borderColor: '#245e51', backgroundColor: '#eef6ef' },
  hiddenCard: { opacity: 0.6 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  pressed: { opacity: 0.8 },
  badge: { position: 'absolute', top: 4, left: 4, backgroundColor: '#245e51', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  name: { fontWeight: '600', color: '#183a36', fontSize: 13 },
});

