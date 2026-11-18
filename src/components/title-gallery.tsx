import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type DimensionValue } from 'react-native';
import { indexKits, kitLabelSummary, preferenceMatches } from '../domain/kit-label-search';
import type { Kit, KitLabel, Mark, Title } from '../domain/model';
import { TitleCard } from './title-card';
import { Action, Actions, Field, Label, Note } from './ui';

const PAGE_SIZE = 18;

export function TitleGallery({ titles, kits, labels, marks, disabled, onMark, onShowDetails }: {
  titles: Title[]; kits: Kit[]; labels: KitLabel[]; marks: Record<string, Mark>; disabled: boolean;
  onMark: (titleId: string, value: Mark | null) => void;
  onShowDetails: (titleId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [showWont, setShowWont] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [wontLimit, setWontLimit] = useState(PAGE_SIZE);
  const [readLimit, setReadLimit] = useState(PAGE_SIZE);
  const columns = width >= 1000 ? 5 : width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const cardWidth: DimensionValue = `${100 / columns}%`;
  const kitsByTitle = useMemo(() => indexKits(kits), [kits]);
  const labelById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const activeLabels = selectedLabels.filter((id) => labelById.has(id));
  const visible = titles.filter((title) => !marks[title.id] &&
    preferenceMatches(title, kitsByTitle.get(title.id) ?? [], labelById, query, activeLabels));
  const wont = titles.filter((title) => marks[title.id] === 'wont');
  const read = titles.filter((title) => marks[title.id] === 'read');

  function cards(values: Title[], hidden?: 'wont' | 'read') {
    return <View style={styles.grid}>
      {values.map((title) => <TitleCard key={title.id} title={title} width={cardWidth} disabled={disabled} hidden={hidden}
        kitLabels={kitLabelSummary(kitsByTitle.get(title.id) ?? [], labelById)}
        onSelect={() => onMark(title.id, 'selected')} onDismiss={() => onMark(title.id, 'wont')} onRead={() => onMark(title.id, 'read')}
        onRestore={() => onMark(title.id, null)} onShowDetails={() => onShowDetails(title.id)} />)}
    </View>;
  }

  return <View style={styles.section}>
    <Action title={paletteOpen ? 'Hide add-title palette' : 'Add titles'} expanded={paletteOpen} onPress={() => setPaletteOpen(!paletteOpen)} />
    {paletteOpen && <>
      <Label>Add titles</Label>
      <Note>Browse titles and add them to your ranked choices. Won’t read and Already read move titles to separate bins below.</Note>
      <Field label="Find a title" value={query} placeholder="Title, author, ISBN or kit label"
        onChangeText={(value) => { setQuery(value); setVisibleLimit(PAGE_SIZE); }} />
      {labels.length > 0 && <>
        <Action title={filtersOpen ? 'Hide genre and vibe filters' : `Filter by genre or vibe (${activeLabels.length} selected)`} expanded={filtersOpen} onPress={() => setFiltersOpen(!filtersOpen)} />
        {filtersOpen && <>
          <Note>One kit must have every selected label. Labels help find titles; they do not reserve a kit or guarantee availability. Scheduling may assign any eligible kit for the title.</Note>
          {(['genre', 'vibe'] as const).map((category) => <View key={category}>
            <Note>{category === 'genre' ? 'Genres' : 'Book-club vibes'}</Note>
            <Actions>{labels.filter((label) => label.category === category).map((label) =>
              <Action key={label.id} title={label.name} selected={activeLabels.includes(label.id)} onPress={() => {
                setSelectedLabels(activeLabels.includes(label.id) ? activeLabels.filter((id) => id !== label.id) : [...activeLabels, label.id]);
                setVisibleLimit(PAGE_SIZE);
              }} />)}</Actions>
          </View>)}
          {activeLabels.length > 0 && <Action title="Clear label filters" onPress={() => { setSelectedLabels([]); setVisibleLimit(PAGE_SIZE); }} />}
        </>}
      </>}
      <Note>{visible.length} matching titles</Note>
      {cards(visible.slice(0, visibleLimit))}
      {visible.length > visibleLimit && <Action title={`Show more titles (${visible.length - visibleLimit} remaining)`} onPress={() => setVisibleLimit(visibleLimit + PAGE_SIZE)} />}
      {visible.length === 0 && <Note>{query || activeLabels.length ? 'No matching titles to add.' : 'No more titles to add.'}</Note>}
    </>}
    <Action title={showWont ? `Hide Won’t read (${wont.length})` : `Won’t read bin (${wont.length})`} expanded={showWont} onPress={() => setShowWont(!showWont)} />
    {showWont && <>
      <Note>Restore a title to return it to the add-title palette.</Note>
      {wont.length ? cards(wont.slice(0, wontLimit), 'wont') : <Note>No titles in Won’t read.</Note>}
      {wont.length > wontLimit && <Action title={`Show more Won’t read (${wont.length - wontLimit} remaining)`} onPress={() => setWontLimit(wontLimit + PAGE_SIZE)} />}
    </>}
    <Action title={showRead ? `Hide already read (${read.length})` : `Already read (${read.length})`} expanded={showRead} onPress={() => setShowRead(!showRead)} />
    {showRead && <>
      <Note>These are your individual already-read marks, separate from your club’s reading history.</Note>
      {read.length ? cards(read.slice(0, readLimit), 'read') : <Note>No individual already-read marks.</Note>}
      {read.length > readLimit && <Action title={`Show more already read (${read.length - readLimit} remaining)`} onPress={() => setReadLimit(readLimit + PAGE_SIZE)} />}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
