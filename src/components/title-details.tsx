import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Kit, KitLabel, Title } from '../domain/model';
import { TitleCover } from './title-cover';
import { titleDetailRows } from './title-details-rows';
import { Action, Actions, Note } from './ui';

export function TitleDetails({ title, kits, labels, onClose }: { title: Title; kits?: Kit[]; labels?: KitLabel[]; onClose: () => void }) {
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss details" />
      <ScrollView style={styles.sheet} contentContainerStyle={styles.panel} accessibilityLabel={`Details for ${title.name}`}>
        <Details title={title} kits={kits} labels={labels} onClose={onClose} />
      </ScrollView>
    </View>
  </Modal>;
}

function Details({ title, kits, labels, onClose }: { title: Title; kits?: Kit[]; labels?: KitLabel[]; onClose: () => void }) {
  const labelById = new Map((labels ?? []).map((label) => [label.id, label]));
  return <>
    <View style={styles.header}>
      <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={styles.cover} />
      <View style={styles.headerText}>
        <Text style={styles.name}>{title.name}</Text>
        <Text style={styles.meta}>{title.author}</Text>
      </View>
    </View>
    {titleDetailRows(title).map(([label, value]) => <Text key={label} style={styles.row}>
      <Text style={styles.label}>{label}: </Text>{value}
    </Text>)}
    <Text style={styles.synopsisLabel}>Description</Text>
    {title.synopsis
      ? <Text style={styles.synopsis}>{title.synopsis}</Text>
      : <Note>No description stored for this title.</Note>}
    {kits && labels && <>
      <Text style={styles.synopsisLabel}>Kit labels</Text>
      {kits.length === 0 ? <Note>No physical kits for this title.</Note> : kits.map((kit) =>
        <Note key={kit.id}>{kit.barcode} · {kit.branch}: {kit.labelIds.map((id) => labelById.get(id)?.name).filter(Boolean).join(', ') || 'No labels'}</Note>)}
      <Note>Labels describe individual kits and do not reserve a kit or guarantee availability. Scheduling may assign any eligible kit for this title.</Note>
    </>}
    <Actions>
      <Action title="Close details" onPress={onClose} />
    </Actions>
  </>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(24, 58, 54, 0.45)', justifyContent: 'center', padding: 16 },
  sheet: { maxHeight: '85%', backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#d6ddd9', borderRadius: 4 },
  panel: { gap: 8, padding: 14 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cover: { width: 64, height: 96, borderRadius: 3, marginRight: 0 },
  headerText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700', color: '#183a36' },
  meta: { color: '#4b5b58' },
  row: { color: '#183a36' },
  label: { fontWeight: '600' },
  synopsisLabel: { fontWeight: '600', color: '#183a36', marginTop: 4 },
  synopsis: { color: '#183a36', lineHeight: 20 },
});
