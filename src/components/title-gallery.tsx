import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type DimensionValue } from 'react-native';
import type { Mark, Title } from '../domain/model';
import { TitleCard } from './title-card';
import { Action, Actions, Note } from './ui';

export function TitleGallery({ titles, marks, pendingTitleId, disabled, lastDismissedId, onMark }: {
  titles: Title[]; marks: Record<string, Mark>; pendingTitleId: string | null; disabled: boolean;
  lastDismissedId: string | null; onMark: (titleId: string, value: Mark | null) => void;
}) {
  const { width } = useWindowDimensions();
  const [showHidden, setShowHidden] = useState(false);
  const columns = width >= 1000 ? 5 : width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const cardWidth: DimensionValue = `${100 / columns}%`;
  const visible = titles.filter((title) => !marks[title.id] || marks[title.id] === 'selected');
  const hidden = titles.filter((title) => marks[title.id] === 'wont' || marks[title.id] === 'read');
  const selectedCount = visible.filter((title) => marks[title.id] === 'selected').length;
  const dismissed = titles.find((title) => title.id === lastDismissedId);

  return <View style={styles.section}>
    <Note>{selectedCount} selected · {visible.length} to choose from. Tap a cover to select it, or use Won’t read to hide it.</Note>
    {dismissed && <Actions><Note>Dismissed “{dismissed.name}”.</Note>
      <Action title="Undo" disabled={disabled} onPress={() => onMark(dismissed.id, null)} /></Actions>}
    <View style={styles.grid}>
      {visible.map((title) => <TitleCard
        key={title.id}
        title={title}
        mark={marks[title.id]}
        width={cardWidth}
        pending={pendingTitleId === title.id}
        disabled={disabled}
        onToggleSelect={() => onMark(title.id, marks[title.id] === 'selected' ? null : 'selected')}
        onDismiss={() => onMark(title.id, 'wont')}
        onRestore={() => onMark(title.id, null)} />)}
    </View>
    {visible.length === 0 && <Note>All available titles are dismissed. Show dismissed titles to restore them.</Note>}
    {hidden.length > 0 && <>
      <Action title={showHidden ? 'Hide dismissed' : `Show dismissed (${hidden.length})`} onPress={() => setShowHidden((value) => !value)} />
      {showHidden && <View style={styles.grid}>
        {hidden.map((title) => <TitleCard
          key={title.id}
          title={title}
          mark={marks[title.id]}
          width={cardWidth}
          pending={pendingTitleId === title.id}
          disabled={disabled}
          onToggleSelect={() => undefined}
          onDismiss={() => undefined}
          onRestore={() => onMark(title.id, null)} />)}
      </View>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
