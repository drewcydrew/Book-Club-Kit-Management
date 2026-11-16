import { ActivityIndicator, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Mark, Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { Action } from './ui';

const markLabels: Record<Mark, string> = { selected: 'Selected', read: 'Already read', wont: 'Won’t read' };

export function TitleCard({ title, mark, width, pending, disabled, onToggleSelect, onDismiss, onRestore }: {
  title: Title; mark?: Mark; width: DimensionValue; pending: boolean; disabled: boolean;
  onToggleSelect: () => void; onDismiss: () => void; onRestore: () => void;
}) {
  const hidden = mark === 'wont' || mark === 'read';
  const selected = mark === 'selected';
  const coverDisabled = disabled || pending || hidden;
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
        {pending && <View style={styles.overlay}><ActivityIndicator /><Text style={styles.overlayText}>Saving…</Text></View>}
      </Pressable>
      <Text numberOfLines={2} style={styles.name}>{title.name}</Text>
      <Text numberOfLines={1} style={styles.author}>{title.author}</Text>
      {hidden
        ? <Action title="Restore" disabled={disabled || pending} onPress={onRestore} />
        : <Action title="Won’t read" disabled={disabled || pending} onPress={onDismiss} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { padding: 6 },
  card: { backgroundColor: '#fffefa', borderWidth: 2, borderColor: 'transparent', padding: 8, gap: 6 },
  selectedCard: { borderColor: '#245e51', backgroundColor: '#eef6ef' },
  hiddenCard: { opacity: 0.6 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  pressed: { opacity: 0.8 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#245e51', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  overlayText: { color: '#183a36', fontWeight: '600' },
  name: { fontWeight: '600', color: '#183a36' },
  author: { color: '#465c56', fontSize: 13 },
});
