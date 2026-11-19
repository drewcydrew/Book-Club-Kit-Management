import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './design';
import { useGalleryColumns } from './gallery-columns';
import { animateLayout, useReducedMotion } from './motion';
import { PreferenceSurface } from './preference-surface';
import type { RankingListProps } from './ranking-types';
import { TitleCover } from './title-cover';

// Native ranking: tap a card to select it, then use the pills over its cover to move, inspect or remove it.
export function RankingList({ items, disabled, columns: panelColumns, onReorder, onRemove, onShowDetails }: RankingListProps) {
  const defaultColumns = useGalleryColumns();
  const columns = panelColumns ?? defaultColumns;
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.some((item) => item.id === selectedId) ? selectedId : null;

  function move(from: number, to: number) {
    animateLayout(reduced);
    onReorder(from, to);
  }

  return <View style={styles.grid}>
    {items.map((item, index) => {
      const isSelected = item.id === selected;
      return <View key={item.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
        <PreferenceSurface kind="rank" active={isSelected} enterDelay={Math.min(index, 10) * 30} style={styles.card}
          media={<View style={styles.coverWrap}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.label}, choice ${index + 1}`}
              accessibilityHint={isSelected ? 'Hide controls' : 'Show controls to reorder, view details or remove'}
              accessibilityState={{ selected: isSelected }} onPress={() => setSelectedId(isSelected ? null : item.id)}
              style={StyleSheet.absoluteFill}>
              <TitleCover coverUrl={item.coverUrl} isbn={item.isbn} style={styles.cover} />
            </Pressable>
            <View pointerEvents="none" style={[styles.badge, index < 3 && styles.topBadge]}>
              <Text style={[styles.badgeText, index < 3 && styles.topBadgeText]}>{index + 1}</Text>
            </View>
            {isSelected && <View style={styles.controls}>
              <View style={styles.controlRow}>
                <Pill label="←" accessibilityLabel={`Move ${item.label} earlier`} disabled={disabled || index === 0} onPress={() => move(index, index - 1)} />
                <Pill label="→" accessibilityLabel={`Move ${item.label} later`} disabled={disabled || index === items.length - 1} onPress={() => move(index, index + 1)} />
              </View>
              <View style={styles.controlRow}>
                <Pill label="Details" accessibilityLabel={`Show details for ${item.label}`} onPress={() => onShowDetails(item.id)} />
                <Pill label="Remove" accessibilityLabel={`Remove ${item.label} from selections`} disabled={disabled} onPress={() => { animateLayout(reduced); onRemove(item.id); }} />
              </View>
            </View>}
          </View>}>
          <Text style={styles.name} numberOfLines={2}>{item.label}</Text>
          {item.author ? <Text style={styles.author} numberOfLines={1}>{item.author}</Text> : null}
          <Text style={styles.labels} numberOfLines={2}>{item.kitLabels}</Text>
          {item.clubRead && <Text style={styles.history}>Already read by your club</Text>}
        </PreferenceSurface>
      </View>;
    })}
  </View>;
}

function Pill({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} hitSlop={4} onPress={onPress}
    style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, disabled && styles.pillDisabled]}>
    <Text style={styles.pillText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  cell: { padding: 4 },
  card: { flex: 1 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3 },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  badge: { position: 'absolute', top: 8, left: 8, minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: 'rgba(255, 255, 255, 0.92)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)' },
  topBadge: { backgroundColor: colors.accent },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  topBadgeText: { color: '#fff' },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8, gap: 6 },
  controlRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  pill: { minWidth: 44, minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.85)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)' },
  pillPressed: { backgroundColor: 'rgba(255, 255, 255, 0.98)' },
  pillDisabled: { opacity: 0.45 },
  pillText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  name: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  author: { color: colors.muted, fontSize: 13 },
  labels: { color: colors.muted, fontSize: 12 },
  history: { color: colors.warning, fontWeight: '600', fontSize: 12 },
});
