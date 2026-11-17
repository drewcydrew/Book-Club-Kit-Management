import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { filterScheduleTitleGroups, previewScheduleKit, scheduleTitleGroups, type ScheduleTitleGroup } from '../domain/schedule-options';
import type { Assignment, Cycle, Data, Slot } from '../domain/model';
import { TitleCover } from './title-cover';
import { Action, Actions, Label, Note, styles as uiStyles } from './ui';

type Props = {
  data: Data;
  cycle: Cycle;
  slot: Slot;
  assignments: Assignment[];
  selected: Assignment | undefined;
  pendingKitId: string;
  meeting: string;
  stale: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ScheduleTitlePicker({ data, cycle, slot, assignments, selected, pendingKitId, meeting, stale, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => scheduleTitleGroups(data, cycle, slot, assignments), [data, cycle, slot, assignments]);
  const matches = useMemo(() => filterScheduleTitleGroups(groups, query), [groups, query]);
  const kitsById = useMemo(() => new Map(data.kits.map((kit) => [kit.id, kit])), [data.kits]);
  const titlesById = useMemo(() => new Map(data.titles.map((title) => [title.id, title])), [data.titles]);
  const allAssignments = useMemo(() => [...data.assignments.filter((a) => a.cycleId !== cycle.id), ...assignments], [data.assignments, cycle.id, assignments]);
  function renderGroup(group: ScheduleTitleGroup) {
    return <TitleGroup group={group} selected={selected} pendingKitId={pendingKitId}
      preview={(kit) => previewScheduleKit(data, cycle, slot, meeting, selected, kit, allAssignments, stale, kitsById, titlesById)}
      onSelect={(id) => { onSelect(id); onClose(); }} />;
  }

  return <View style={styles.panel}>
    <Label>Choose a title and kit</Label>
        <TextInput autoFocus accessibilityLabel="Search titles and kits" placeholder="Search title, author, barcode or branch" value={query} onChangeText={setQuery} style={uiStyles.input} />
        <Note>Local conflict preview only. Expand a title to compare its kits; warnings do not prevent selection.</Note>
        <Note>{matches.length} of {groups.length} titles shown</Note>
        <FlatList data={matches} keyExtractor={(group) => group.titleId} keyboardShouldPersistTaps="handled" style={styles.list}
          ListEmptyComponent={<Note>Nothing matches this search.</Note>} renderItem={({ item }) => renderGroup(item)} />
        <Actions><Action title="Close picker" onPress={onClose} /></Actions>
  </View>;
}

function TitleGroup({ group, selected, pendingKitId, preview, onSelect }: {
  group: ScheduleTitleGroup; selected: Assignment | undefined; pendingKitId: string;
  preview: (kit: ScheduleTitleGroup['kits'][number]) => ReturnType<typeof previewScheduleKit>; onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.group}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
      style={({ pressed }) => [styles.groupHeader, pressed && uiStyles.pressed]}>
      {group.title && (group.title.coverUrl || group.title.isbn.trim())
        ? <TitleCover coverUrl={group.title.coverUrl} isbn={group.title.isbn} style={styles.cover} />
        : <View style={[styles.cover, styles.coverPlaceholder]}><Text style={styles.placeholderText}>No cover</Text></View>}
      <View style={styles.groupDetails}>
        <Text style={styles.title}>{group.title?.name ?? 'Unavailable title'} {expanded ? '−' : '+'}</Text>
        <Note>{group.title?.author ?? `Missing title ${group.titleId}`} · {group.rank === null ? 'Unranked' : `Priority ${group.rank}`}
          {group.alreadyAssigned ? ' · Assigned to another meeting' : ''}{group.kits.some((kit) => kit.id === selected?.kitId) ? ' · Current title' : ''}</Note>
        {!group.kits.length && <Note>No physical kits available.</Note>}
      </View>
    </Pressable>
    {expanded && group.kits.map((kit) => {
      const result = preview(kit);
      return <Pressable key={kit.id} accessibilityRole="button" accessibilityState={{ selected: kit.id === pendingKitId, disabled: !group.title }}
        disabled={!group.title} onPress={() => onSelect(kit.id)}
        style={({ pressed }) => [styles.kit, kit.id === pendingKitId && styles.selected, pressed && uiStyles.pressed, !group.title && uiStyles.disabled]}>
        <Text style={styles.kitName}>{kit.barcode} · {kit.branch} · {kit.status}{kit.id === selected?.kitId ? ' · Current' : ''}{kit.id === pendingKitId ? ' · Selected' : ''}</Text>
        <Text style={result.state === 'warning' ? styles.warning : styles.preview}>
          {result.state === 'clear' ? 'No conflicts detected' : result.state === 'unknown' ? 'Cannot assess' : 'Conflict warning'}
        </Text>
        {result.messages.map((message) => <Text key={message} style={styles.preview}>{message}</Text>)}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  panel: { flexShrink: 1, gap: 10 },
  list: { flexShrink: 1 },
  group: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#c9d6d1' },
  groupHeader: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  groupDetails: { flex: 1, gap: 3 },
  cover: { width: 40, height: 60, marginRight: 0, borderRadius: 4 },
  coverPlaceholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 10, color: '#6b7280', textAlign: 'center' },
  title: { color: '#183a36', fontWeight: '700', fontSize: 16 },
  kit: { minHeight: 48, marginLeft: 12, padding: 10, gap: 3, borderLeftWidth: 2, borderLeftColor: '#a9beb5' },
  selected: { backgroundColor: '#d6e5d8' },
  kitName: { color: '#183a36', fontWeight: '600' },
  warning: { color: '#a22525', fontWeight: '700' },
  preview: { color: '#465c56' },
});
