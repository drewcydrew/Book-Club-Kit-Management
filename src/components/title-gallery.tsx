import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type DimensionValue } from 'react-native';
import { indexKits, preferenceMatches } from '../domain/kit-label-search';
import type { Kit, KitLabel, Mark, Title } from '../domain/model';
import { TitleCard } from './title-card';
import { Action, Actions, Field, Note } from './ui';

const PAGE_SIZE = 18;

export function TitleGallery({ titles, kits, labels, marks, disabled, lastDismissedId, onMark, onShowDetails }: {
  titles: Title[]; kits: Kit[]; labels: KitLabel[]; marks: Record<string, Mark>; disabled: boolean;
  lastDismissedId: string | null; onMark: (titleId: string, value: Mark | null) => void;
  onShowDetails: (titleId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [hiddenLimit, setHiddenLimit] = useState(PAGE_SIZE);
  const columns = width >= 1000 ? 6 : width >= 700 ? 5 : width >= 480 ? 4 : 3;
  const cardWidth: DimensionValue = `${100 / columns}%`;
  const kitsByTitle = useMemo(() => indexKits(kits), [kits]);
  const labelById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const activeLabels = selectedLabels.filter((id) => labelById.has(id));
  const matching = titles.filter((title) => preferenceMatches(title, kitsByTitle.get(title.id) ?? [], labelById, query, activeLabels));
  const visible = matching.filter((title) => !marks[title.id] || marks[title.id] === 'selected');
  const hidden = matching.filter((title) => marks[title.id] === 'wont' || marks[title.id] === 'read');
  const selectedCount = titles.filter((title) => marks[title.id] === 'selected').length;
  const dismissed = titles.find((title) => title.id === lastDismissedId);

  return <View style={styles.section}>
    <Note>{selectedCount} selected · {visible.length} matching titles. Tap a cover to select it, or use Won’t read to hide it.</Note>
    <Field label="Find a title" value={query} placeholder="Title, author, ISBN or kit label" onChangeText={(value) => { setQuery(value); setVisibleLimit(PAGE_SIZE); setHiddenLimit(PAGE_SIZE); }} />
    {labels.length > 0 && <>
      <Action title={filtersOpen ? 'Hide genre and vibe filters' : `Filter by genre or vibe (${activeLabels.length} selected)`} onPress={() => setFiltersOpen(!filtersOpen)} />
      {filtersOpen && <>
        <Note>One kit must have every selected label. Labels help find titles; they do not reserve a kit or guarantee availability. Scheduling may assign any eligible kit for the title.</Note>
        {(['genre', 'vibe'] as const).map((category) => <View key={category}>
          <Note>{category === 'genre' ? 'Genres' : 'Book-club vibes'}</Note>
          <Actions>{labels.filter((label) => label.category === category).map((label) =>
            <Action key={label.id} title={label.name} selected={activeLabels.includes(label.id)} onPress={() => {
              setSelectedLabels(activeLabels.includes(label.id) ? activeLabels.filter((id) => id !== label.id) : [...activeLabels, label.id]);
              setVisibleLimit(PAGE_SIZE); setHiddenLimit(PAGE_SIZE);
            }} />)}</Actions>
        </View>)}
        {activeLabels.length > 0 && <Action title="Clear label filters" onPress={() => { setSelectedLabels([]); setVisibleLimit(PAGE_SIZE); setHiddenLimit(PAGE_SIZE); }} />}
      </>}
    </>}
    {dismissed && <Actions><Note>Dismissed “{dismissed.name}”.</Note>
      <Action title="Undo" disabled={disabled} onPress={() => onMark(dismissed.id, null)} /></Actions>}
    <View style={styles.grid}>
      {visible.slice(0, visibleLimit).map((title) => <TitleCard
        key={title.id}
        title={title}
        mark={marks[title.id]}
        width={cardWidth}
        disabled={disabled}
        onToggleSelect={() => onMark(title.id, marks[title.id] === 'selected' ? null : 'selected')}
        onDismiss={() => onMark(title.id, 'wont')}
        onRestore={() => onMark(title.id, null)}
        onShowDetails={() => onShowDetails(title.id)} />)}
    </View>
    {visible.length > visibleLimit && <Action title={`Show more titles (${visible.length - visibleLimit} remaining)`} onPress={() => setVisibleLimit(visibleLimit + PAGE_SIZE)} />}
    {visible.length === 0 && <Note>{query || activeLabels.length ? 'No matching available titles.' : 'All available titles are dismissed. Show dismissed titles to restore them.'}</Note>}
    {hidden.length > 0 && <>
      <Action title={showHidden ? 'Hide dismissed' : `Show dismissed (${hidden.length})`} onPress={() => setShowHidden((value) => !value)} />
      {showHidden && <View style={styles.grid}>
        {hidden.slice(0, hiddenLimit).map((title) => <TitleCard
          key={title.id}
          title={title}
          mark={marks[title.id]}
          width={cardWidth}
          disabled={disabled}
          onToggleSelect={() => undefined}
          onDismiss={() => undefined}
          onRestore={() => onMark(title.id, null)}
          onShowDetails={() => onShowDetails(title.id)} />)}
      </View>}
      {showHidden && hidden.length > hiddenLimit && <Action title={`Show more dismissed (${hidden.length - hiddenLimit} remaining)`} onPress={() => setHiddenLimit(hiddenLimit + PAGE_SIZE)} />}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
