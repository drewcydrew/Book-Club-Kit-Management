import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { Action, Actions, Note } from './ui';
import { TitleCover } from './title-cover';
import { RANKING_ROW_GAP, rankingDragTarget } from './ranking-layout';
import { PreferenceSurface } from './preference-surface';

type RankedItem = {
  id: string; label: string; author: string; coverUrl: string | null; isbn: string;
  kitLabels: string; clubRead: boolean;
};
type Drag = { from: number; to: number; dy: number; height: number };
type RowLayout = { height: number };

export function RankingList({ items, disabled, onReorder, onRemove, onDismiss, onRead, onShowDetails }: {
  items: RankedItem[]; disabled: boolean;
  onReorder: (from: number, to: number) => void; onRemove: (titleId: string) => void;
  onDismiss: (titleId: string) => void; onRead: (titleId: string) => void; onShowDetails: (titleId: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const layouts = useRef<Record<string, RowLayout>>({});
  const dragOrder = useRef<string[]>([]);
  const currentItems = useRef(items);
  const currentDisabled = useRef(disabled);
  useLayoutEffect(() => {
    currentItems.current = items;
    currentDisabled.current = disabled;
  }, [items, disabled]);

  function targetFor(index: number, dy: number): number {
    return rankingDragTarget(items.map((item) => layouts.current[item.id]?.height), index, dy);
  }

  function offsetFor(index: number): number {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -(drag.height + RANKING_ROW_GAP);
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.height + RANKING_ROW_GAP;
    return 0;
  }

  return <View style={styles.list}>
    {items.map((item, index) => <RankRow
      key={item.id} item={item} index={index} disabled={disabled}
      offset={offsetFor(index)} active={drag?.from === index}
      canMoveUp={index > 0} canMoveDown={index < items.length - 1}
      onLayout={(layout) => { layouts.current[item.id] = layout; }}
      onDragStart={() => {
        dragOrder.current = items.map((value) => value.id);
        setDrag({ from: index, to: index, dy: 0, height: layouts.current[item.id]?.height ?? 0 });
      }}
      onDragMove={(dy) => setDrag((current) => current && current.from === index
        ? { ...current, dy, to: targetFor(index, dy) } : current)}
      onDragEnd={(dy) => {
        setDrag(null);
        const currentOrder = currentItems.current.map((value) => value.id);
        if (currentDisabled.current || currentOrder.length !== dragOrder.current.length || currentOrder.some((id, i) => id !== dragOrder.current[i])) return;
        const to = targetFor(index, dy);
        if (to !== index) onReorder(index, to);
      }}
      onDragCancel={() => setDrag(null)}
      onMoveUp={() => onReorder(index, index - 1)} onMoveDown={() => onReorder(index, index + 1)}
      onRemove={() => onRemove(item.id)} onDismiss={() => onDismiss(item.id)} onRead={() => onRead(item.id)} onShowDetails={() => onShowDetails(item.id)} />)}
  </View>;
}

function RankRow({ item, index, disabled, offset, active, canMoveUp, canMoveDown, onLayout, onDragStart, onDragMove, onDragEnd, onDragCancel, onMoveUp, onMoveDown, onRemove, onDismiss, onRead, onShowDetails }: {
  item: RankedItem; index: number; disabled: boolean; offset: number; active: boolean; canMoveUp: boolean; canMoveDown: boolean;
  onLayout: (layout: RowLayout) => void; onDragStart: () => void; onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void; onDragCancel: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onRemove: () => void; onDismiss: () => void; onRead: () => void; onShowDetails: () => void;
}) {
  const handle = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_event, state) => onDragMove(state.dy),
    onPanResponderRelease: (_event, state) => onDragEnd(state.dy),
    onPanResponderTerminate: onDragCancel,
  });
  const stopWebDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWebDrag.current?.(), []);
  const webHandle = {
    onPointerDown: (event: { nativeEvent: unknown }) => {
      if (disabled) return;
      const startY = (event.nativeEvent as { clientY: number }).clientY;
      const move = (moveEvent: PointerEvent) => onDragMove(moveEvent.clientY - startY);
      const finish = (endEvent: PointerEvent) => { stop(); onDragEnd(endEvent.clientY - startY); };
      const cancel = () => { stop(); onDragCancel(); };
      function stop() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        stopWebDrag.current = null;
      }
      stopWebDrag.current = stop;
      onDragStart();
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
    },
  };
  const handleProps = Platform.OS === 'web' ? webHandle : handle.panHandlers;
  const dragHandle = <View {...handleProps} accessibilityLabel={`Drag ${item.label} to reorder`} style={[styles.handle, disabled && styles.handleDisabled, Platform.OS === 'web' && styles.webHandle]}>
    <Text style={styles.handleText}>⠿</Text>
  </View>;
  return <PreferenceSurface kind="rank" onLayout={(event) => onLayout({ height: event.nativeEvent.layout.height })}
    style={[styles.row, offset !== 0 && { transform: [{ translateY: offset }] }, active && styles.activeRow]}
    actions={<Actions>
      {Platform.OS === 'web' && dragHandle}
      <Action title="Details" accessibilityLabel={`Show details for ${item.label}`} onPress={onShowDetails} />
      <Action title="↑" accessibilityLabel={`Move ${item.label} up`} disabled={disabled || !canMoveUp} onPress={onMoveUp} />
      <Action title="↓" accessibilityLabel={`Move ${item.label} down`} disabled={disabled || !canMoveDown} onPress={onMoveDown} />
      <Action title="Remove" accessibilityLabel={`Remove ${item.label} from selections`} disabled={disabled} onPress={onRemove} />
      <Action title="Won’t read" accessibilityLabel={`Won’t read ${item.label}`} disabled={disabled} onPress={onDismiss} />
      <Action title="Already read" accessibilityLabel={`Already read ${item.label}`} disabled={disabled} onPress={onRead} />
    </Actions>}>
    <View style={styles.heading}>
      {Platform.OS !== 'web' && dragHandle}
      <Text style={styles.rank}>{index + 1}.</Text>
      <View style={styles.coverSlot}><TitleCover coverUrl={item.coverUrl} isbn={item.isbn} style={styles.thumb} /></View>
      <View style={styles.description}>
        <Text style={styles.title}>{item.label}</Text>
        {item.author ? <Note>{item.author}</Note> : null}
        <Note>{item.kitLabels}</Note>
        {item.clubRead && <Text style={styles.history}>Already read by your club</Text>}
      </View>
    </View>
  </PreferenceSurface>;
}

const styles = StyleSheet.create({
  list: { gap: RANKING_ROW_GAP },
  row: { gap: 8, padding: 10, backgroundColor: '#f5faf5', borderWidth: 1, borderColor: '#cadccf', borderRadius: 6 },
  activeRow: { zIndex: 10, backgroundColor: '#e4f2e7', elevation: 4 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  handle: { minWidth: 34, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  handleDisabled: { opacity: 0.4 },
  webHandle: { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object,
  handleText: { fontSize: 20, color: '#245e51' },
  rank: { minWidth: 24, paddingTop: 10, fontWeight: '700', color: '#183a36' },
  coverSlot: { width: 42, minHeight: 60 },
  thumb: { width: 42, height: 60, borderRadius: 3, marginRight: 0 },
  description: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontWeight: '700', color: '#183a36', fontSize: 16 },
  history: { color: '#7a4b00', fontWeight: '600' },
});
