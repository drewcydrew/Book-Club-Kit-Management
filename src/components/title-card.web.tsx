import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TitleCover } from './title-cover';
import { Action, Note } from './ui';
import { PreferenceSurface } from './preference-surface';
import type { TitleCardProps } from './title-card-types';

export function TitleCard({ title, kitLabels, width, disabled, hidden, enterDelay, onSelect, onDismiss, onRead, onRestore, onShowDetails }: TitleCardProps) {
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
  card: { flex: 1 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  cover: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  name: { fontWeight: '700', color: '#183a36', fontSize: 15 },
});
