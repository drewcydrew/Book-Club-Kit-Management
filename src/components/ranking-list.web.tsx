/// <reference types="expo/types" />
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Action, Note } from './ui';
import { TitleCover } from './title-cover';
import { PreferenceSurface } from './preference-surface';
import { rankingGridTarget } from './ranking-layout';
import { useGalleryColumns } from './gallery-columns';
import type { RankingListProps } from './ranking-types';
import styles from './ranking-list.module.css';

type Drag = { from: number; to: number; dx: number; dy: number };

const DRAG_THRESHOLD = 6;

export function RankingList({ items, disabled, columns: panelColumns, onReorder, onRemove, onShowDetails }: RankingListProps) {
  const defaultColumns = useGalleryColumns();
  const columns = panelColumns ?? defaultColumns;
  const [drag, setDrag] = useState<Drag | null>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const latest = useRef({ items, disabled, onReorder, onShowDetails });
  const stopDrag = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    latest.current = { items, disabled, onReorder, onShowDetails };
  }, [items, disabled, onReorder, onShowDetails]);
  useEffect(() => () => stopDrag.current?.(), []);

  function startDrag(index: number, event: ReactPointerEvent) {
    if (disabled || event.button !== 0 || event.pointerType === 'touch') return;
    const startX = event.clientX;
    const startY = event.clientY;
    const order = items.map((item) => item.id);
    let moved = false;
    const targetAt = (x: number, y: number) => rankingGridTarget(
      order.map((_id, i) => cells.current[i]?.getBoundingClientRect()), index, x, y);
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      setDrag({ from: index, to: targetAt(moveEvent.clientX, moveEvent.clientY), dx, dy });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      stopDrag.current = null;
    };
    function finish(endEvent: PointerEvent) {
      stop();
      setDrag(null);
      const current = latest.current;
      if (!moved) {
        current.onShowDetails(order[index]);
        return;
      }
      const currentOrder = current.items.map((item) => item.id);
      if (current.disabled || currentOrder.length !== order.length || currentOrder.some((id, i) => id !== order[i])) return;
      const to = targetAt(endEvent.clientX, endEvent.clientY);
      if (to !== index) current.onReorder(index, to);
    }
    function cancel() {
      stop();
      setDrag(null);
    }
    stopDrag.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  return <div className={styles.grid}>
    {items.map((item, index) => {
      const dragging = drag?.from === index;
      const target = !!drag && drag.to === index && drag.to !== drag.from;
      return <div key={item.id} ref={(node) => { cells.current[index] = node; }} style={{ width: `${100 / columns}%` }}
        className={[styles.cell, dragging ? styles.dragging : '', target ? styles.target : ''].join(' ')}>
        <PreferenceSurface kind="rank" active={dragging} enterDelay={Math.min(index, 10) * 30}
          style={[local.card, dragging && drag && { transform: [{ translateX: drag.dx }, { translateY: drag.dy }, { scale: 1.04 }] }]}
          media={<div className={disabled ? styles.handleDisabled : styles.handle} onPointerDown={(event) => startDrag(index, event)}
            onPointerUp={(event) => { if (event.pointerType === 'touch') onShowDetails(item.id); }}
            title={disabled ? undefined : 'Drag to reorder, or click for details'}>
            <TitleCover coverUrl={item.coverUrl} isbn={item.isbn} style={local.cover} />
            <span className={`${styles.badge} ${index < 3 ? styles.top : ''}`}>{index + 1}</span>
            {!disabled && <span className={styles.grip} aria-hidden>⠿</span>}
          </div>}
          actions={<>
            <Action title="←" accessibilityLabel={`Move ${item.label} earlier`} disabled={disabled || index === 0} onPress={() => onReorder(index, index - 1)} />
            <Action title="→" accessibilityLabel={`Move ${item.label} later`} disabled={disabled || index === items.length - 1} onPress={() => onReorder(index, index + 1)} />
            <Action title="Details" accessibilityLabel={`Show details for ${item.label}`} onPress={() => onShowDetails(item.id)} />
            <Action title="Remove" accessibilityLabel={`Remove ${item.label} from selections`} disabled={disabled} onPress={() => onRemove(item.id)} />
          </>}>
          <Text style={local.name}>{item.label}</Text>
          {item.author ? <Note>{item.author}</Note> : null}
          <Note>{item.kitLabels}</Note>
          {item.clubRead && <Text style={local.history}>Already read by your club</Text>}
        </PreferenceSurface>
      </div>;
    })}
  </div>;
}

const local = StyleSheet.create({
  card: { flex: 1 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: 'auto', height: 'auto', borderRadius: 0, marginRight: 0 },
  name: { fontWeight: '700', color: '#183a36', fontSize: 15 },
  history: { color: '#7a4b00', fontWeight: '600' },
});
