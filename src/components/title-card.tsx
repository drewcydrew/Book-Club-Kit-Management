import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './design';
import { PreferenceSurface } from './preference-surface';
import { TitleActionSheet, type SheetAction } from './title-action-sheet';
import type { TitleCardProps } from './title-card-types';
import { TitleCover } from './title-cover';

export function TitleCard({ title, kitLabels, width, disabled, hidden, enterDelay, onSelect, onDismiss, onRead, onRestore, onShowDetails }: TitleCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const details: SheetAction = { label: 'Details', accessibilityLabel: `Show details for ${title.name}`, onPress: onShowDetails };
  const actions: SheetAction[] = hidden
    ? [{ label: 'Restore', accessibilityLabel: `Restore ${title.name}`, onPress: onRestore, disabled, primary: true }, details]
    : [
      { label: 'Add to my choices', accessibilityLabel: `Add ${title.name}`, onPress: onSelect, disabled, primary: true },
      { label: 'Won’t read', accessibilityLabel: `Won’t read ${title.name}`, onPress: onDismiss, disabled },
      { label: 'Already read', accessibilityLabel: `Already read ${title.name}`, onPress: onRead, disabled },
      details,
    ];
  return <View style={[styles.wrap, { width }]}>
    {sheetOpen && <TitleActionSheet name={title.name} author={title.author} coverUrl={title.coverUrl} isbn={title.isbn}
      actions={actions} onClose={() => setSheetOpen(false)} />}
    <PreferenceSurface kind="palette" style={styles.card} enterDelay={enterDelay}
      media={<View style={styles.coverWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${title.name}`} onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}>
          <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={styles.cover} />
        </Pressable>
        {!hidden && <Pressable accessibilityRole="button" accessibilityLabel={`Add ${title.name}`} accessibilityState={{ disabled }}
          disabled={disabled} hitSlop={6} onPress={onSelect} style={({ pressed }) => [styles.add, pressed && styles.pressed, disabled && styles.disabled]}>
          <Text style={styles.addText}>+</Text>
        </Pressable>}
      </View>}>
      <Text style={styles.name} numberOfLines={2}>{title.name}</Text>
      {title.author ? <Text style={styles.author} numberOfLines={1}>{title.author}</Text> : null}
      <Text style={styles.labels} numberOfLines={2}>{kitLabels}</Text>
    </PreferenceSurface>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  card: { flex: 1 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3 },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  add: { position: 'absolute', right: 8, bottom: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)' },
  addText: { color: '#fff', fontSize: 24, lineHeight: 26, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  name: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  author: { color: colors.muted, fontSize: 13 },
  labels: { color: colors.muted, fontSize: 12 },
});
