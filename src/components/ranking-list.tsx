import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Action } from './ui';
import { TitleCover } from './title-cover';

const ROW_HEIGHT = 58;

type Drag = { from: number; to: number; dy: number };

export function RankingList({ items, disabled, onReorder }: {
  items: { id: string; label: string; coverUrl: string | null; isbn: string }[];
  disabled: boolean;
  onReorder: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(ROW_HEIGHT, Math.ceil(ROW_HEIGHT * fontScale));
  const last = items.length - 1;
  const targetFor = (index: number, dy: number) => Math.min(last, Math.max(0, index + Math.round(dy / rowHeight)));

  function offsetFor(index: number): number {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -rowHeight;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return rowHeight;
    return 0;
  }

  return <View style={{ height: items.length * rowHeight }}>
    {items.map((item, index) => <RankRow
      key={item.id}
      index={index}
      rowHeight={rowHeight}
      label={item.label}
      coverUrl={item.coverUrl}
      isbn={item.isbn}
      disabled={disabled}
      offset={offsetFor(index)}
      active={drag?.from === index}
      canMoveUp={index > 0}
      canMoveDown={index < last}
      onDragStart={() => setDrag({ from: index, to: index, dy: 0 })}
      onDragMove={(dy) => setDrag({ from: index, to: targetFor(index, dy), dy })}
      onDragEnd={(dy) => {
        const to = targetFor(index, dy);
        setDrag(null);
        if (to !== index) onReorder(index, to);
      }}
      onDragCancel={() => setDrag(null)}
      onMoveUp={() => onReorder(index, index - 1)}
      onMoveDown={() => onReorder(index, index + 1)} />)}
  </View>;
}

function RankRow({ index, rowHeight, label, coverUrl, isbn, disabled, offset, active, canMoveUp, canMoveDown, onDragStart, onDragMove, onDragEnd, onDragCancel, onMoveUp, onMoveDown }: {
  index: number; rowHeight: number; label: string; coverUrl: string | null; isbn: string; disabled: boolean; offset: number; active: boolean;
  canMoveUp: boolean; canMoveDown: boolean;
  onDragStart: () => void; onDragMove: (dy: number) => void; onDragEnd: (dy: number) => void; onDragCancel: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
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
      const finish = (endEvent: PointerEvent) => {
        stop();
        onDragEnd(endEvent.clientY - startY);
      };
      const cancel = () => {
        stop();
        onDragCancel();
      };
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
  return <View
    style={[styles.row, { top: index * rowHeight, height: rowHeight, transform: [{ translateY: offset }] }, active && styles.activeRow]}>
    <View {...handleProps} accessibilityLabel={`Drag ${label} to reorder`} style={[styles.handle, disabled && styles.handleDisabled, Platform.OS === 'web' && styles.webHandle]}>
      <Text style={styles.handleText}>⠿</Text>
    </View>
    <Text style={styles.rank}>{index + 1}.</Text>
    <TitleCover coverUrl={coverUrl} isbn={isbn} style={styles.thumb} />
    <Text numberOfLines={2} style={styles.label}>{label}</Text>
    <Action title="↑" accessibilityLabel={`Move ${label} up`} disabled={disabled || !canMoveUp} onPress={onMoveUp} />
    <Action title="↓" accessibilityLabel={`Move ${label} down`} disabled={disabled || !canMoveDown} onPress={onMoveDown} />
  </View>;
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute', left: 0, right: 0, flexDirection: 'row',
    alignItems: 'center', gap: 8, paddingHorizontal: 4, backgroundColor: '#fffefa',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d6ddd9',
  },
  activeRow: { zIndex: 10, backgroundColor: '#eef6ef', elevation: 4 },
  handle: { paddingHorizontal: 6, paddingVertical: 4 },
  handleDisabled: { opacity: 0.4 },
  webHandle: { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object,
  handleText: { fontSize: 18, color: '#245e51' },
  rank: { width: 28, fontWeight: '600', color: '#183a36' },
  label: { flex: 1, color: '#183a36' },
  thumb: { width: 34, height: 50, borderRadius: 3, marginRight: 0 },
});
