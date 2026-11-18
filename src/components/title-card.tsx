import { Platform, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { Action, Note } from './ui';
import { PreferenceSurface } from './preference-surface';

export function TitleCard({ title, kitLabels, width, disabled, hidden, enterDelay, onSelect, onDismiss, onRead, onRestore, onShowDetails }: {
  title: Title; kitLabels: string; width: DimensionValue; disabled: boolean; hidden?: 'wont' | 'read'; enterDelay?: number;
  onSelect: () => void; onDismiss: () => void; onRead: () => void; onRestore: () => void; onShowDetails: () => void;
}) {
  return <View style={[styles.wrap, { width }]}>
    <PreferenceSurface kind="palette" style={styles.card} enterDelay={enterDelay}
      media={<Pressable accessibilityRole="button" accessibilityLabel={`${hidden ? 'Show details for' : 'Add'} ${title.name}`}
        accessibilityState={{ disabled: !hidden && disabled }} disabled={!hidden && disabled}
        onPress={hidden ? onShowDetails : onSelect} style={styles.coverWrap}>
        <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={styles.cover} />
      </Pressable>}
      actions={<>
        {hidden ? <Action title="Restore" accessibilityLabel={`Restore ${title.name}`} disabled={disabled} onPress={onRestore} /> : <>
          <Action title="Add" accessibilityLabel={`Add ${title.name}`} disabled={disabled} onPress={onSelect} />
          <Action title="Won’t read" accessibilityLabel={`Won’t read ${title.name}`} disabled={disabled} onPress={onDismiss} />
          <Action title="Already read" accessibilityLabel={`Already read ${title.name}`} disabled={disabled} onPress={onRead} />
        </>}
        <Action title="Details" accessibilityLabel={`Show details for ${title.name}`} onPress={onShowDetails} />
      </>}>
      <Text style={styles.name}>{title.name}</Text>
      <Note>{title.author}</Note>
      <Note>{kitLabels}</Note>
    </PreferenceSurface>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  card: Platform.OS === 'web'
    ? { flex: 1 }
    : { flex: 1, backgroundColor: '#f5faf5', borderWidth: 1, borderColor: '#cadccf', borderRadius: 6, padding: 8, gap: 6 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  name: { fontWeight: '700', color: '#183a36', fontSize: 15 },
});
