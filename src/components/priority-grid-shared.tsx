import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { TitleCover } from './title-cover';
import { Action } from './ui';
import { sortPriorityMatrix, type PriorityCell, type PriorityMatrix, type PrioritySort } from '../domain/cycle-overview';
import type { Title } from '../domain/model';

export const GRID_CELL_WIDTH = 116;
export const GRID_ROW_HEIGHT = 112;
export const GRID_HEADER_HEIGHT = 96;
export const GRID_BORDER = '#cbd8d2';
export const GRID_HEADER_BACKGROUND = '#f1f6f2';
export const GRID_BODY_BACKGROUND = '#fffefa';
const CONTESTED = '#b45309';

export function gridTitleWidth(windowWidth: number): number {
  return Math.min(220, Math.max(156, Math.floor(windowWidth * 0.42)));
}

export function nextSort(current: PrioritySort | null, id: string): PrioritySort {
  return { id, direction: current?.id === id && current.direction === 'ascending' ? 'descending' : 'ascending' };
}

export interface PriorityGridProps {
  matrix: PriorityMatrix;
  clubNameFor: (clubId: string) => string;
  titleFor: (titleId: string) => Title | undefined;
  onHideClub: (clubId: string) => void;
  hiddenTitleIds: string[];
  setHiddenTitleIds: React.Dispatch<React.SetStateAction<string[]>>;
  sortClub: PrioritySort | null;
  setSortClub: React.Dispatch<React.SetStateAction<PrioritySort | null>>;
  sortTitle: PrioritySort | null;
  setSortTitle: React.Dispatch<React.SetStateAction<PrioritySort | null>>;
}

export function usePriorityGrid(matrix: PriorityMatrix, hiddenTitleIds: string[], sortClub: PrioritySort | null, sortTitle: PrioritySort | null) {
  const visibleMatrix = useMemo(() => ({ ...matrix, rows: matrix.rows.filter((row) => !hiddenTitleIds.includes(row.titleId)) }), [matrix, hiddenTitleIds]);
  const activeClub = sortClub && matrix.clubIds.includes(sortClub.id) ? sortClub : null;
  const activeTitle = sortTitle && visibleMatrix.rows.some((row) => row.titleId === sortTitle.id) ? sortTitle : null;
  const sorted = useMemo(() => sortPriorityMatrix(visibleMatrix, activeClub, activeTitle), [visibleMatrix, activeClub, activeTitle]);
  return { activeClub, activeTitle, sorted };
}

export function GridStatus({ hiddenCount, onClearHidden, activeClub, activeTitle, onReset }: {
  hiddenCount: number;
  onClearHidden: () => void;
  activeClub: { name: string; direction: PrioritySort['direction'] } | null;
  activeTitle: { name: string; direction: PrioritySort['direction'] } | null;
  onReset: () => void;
}) {
  return <View style={{ gap: 8 }}>
    <Text style={{ color: '#465c56', fontSize: 12 }}>
      Select an arrow to sort by that club or title; select it again to reverse. Unranked entries stay last. Use the eye to hide a row or club.
    </Text>
    {hiddenCount > 0 && <View style={{ alignSelf: 'flex-start' }}>
      <Action title={`Clear hidden titles (${hiddenCount})`} onPress={onClearHidden} />
    </View>}
    {(activeClub || activeTitle) && <View style={{ gap: 4 }}>
      {activeClub && <Text style={{ color: '#244c40' }}>Titles sorted by {activeClub.name} · {activeClub.direction}</Text>}
      {activeTitle && <Text style={{ color: '#244c40' }}>Clubs sorted by {activeTitle.name} · {activeTitle.direction}</Text>}
      <View style={{ alignSelf: 'flex-start' }}><Action title="Reset sorting" onPress={onReset} /></View>
    </View>}
  </View>;
}

export function GridIconButton({ icon, label, direction, onPress }: {
  icon: 'sort' | 'hide';
  label: string;
  direction?: PrioritySort['direction'] | null;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const description = icon === 'sort'
    ? `${label}, ${direction ? `currently ${direction}, activate for ${direction === 'ascending' ? 'descending' : 'ascending'}` : 'activate for ascending'}`
    : label;
  return <Pressable accessibilityRole="button" accessibilityLabel={description}
    accessibilityState={icon === 'sort' ? { selected: !!direction } : undefined} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({
      width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 4,
      borderWidth: 2, borderColor: focused ? '#245e51' : 'transparent',
      backgroundColor: direction ? '#d6e5d8' : 'transparent', opacity: pressed ? 0.6 : 1,
    })}>
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#244c40" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icon === 'sort'
        ? <Path d={direction === 'descending' ? 'M12 4v16 M6 14l6 6 6-6' : 'M12 20V4 M6 10l6-6 6 6'} />
        : <><Path d="M2 12c2.4-4.1 5.7-6.2 10-6.2s7.6 2.1 10 6.2c-2.4 4.1-5.7 6.2-10 6.2S4.4 16.1 2 12Z" /><Circle cx={12} cy={12} r={3} /><Path d="M4 20 20 4" /></>}
    </Svg>
  </Pressable>;
}

export function TitleCell({ title, rankedClubCount, contested, direction, onSort, onHide }: {
  title: Title | undefined;
  rankedClubCount: number;
  contested: boolean;
  direction: PrioritySort['direction'] | null;
  onSort: () => void;
  onHide: () => void;
}) {
  const name = title?.name ?? 'Unavailable title';
  return <View style={{ width: '100%', height: GRID_ROW_HEIGHT, padding: 8, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: GRID_BODY_BACKGROUND, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID_BORDER }}>
    {title && (title.coverUrl || title.isbn.trim()) ?
      <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 40, height: 60, marginRight: 8 }} /> :
      <View style={{ width: 40, height: 60, marginRight: 8, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>No cover</Text>
      </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <GridIconButton icon="sort" direction={direction} label={`Sort clubs by ${name} ranking`} onPress={onSort} />
        <GridIconButton icon="hide" label={`Hide title ${name}`} onPress={onHide} />
      </View>
      <Text numberOfLines={2} style={{ fontWeight: '600', fontSize: 12 }}>{name}</Text>
      {contested && <Text numberOfLines={1} accessibilityLabel={`Contested, ${rankedClubCount} clubs rank this title`} style={{ color: CONTESTED, fontSize: 11, marginTop: 2 }}>
        Contested · {rankedClubCount} clubs rank
      </Text>}
    </View>
  </View>;
}

export function ClubHeaderCell({ name, direction, onSort, onHide }: {
  name: string;
  direction: PrioritySort['direction'] | null;
  onSort: () => void;
  onHide: () => void;
}) {
  return <View style={{ width: GRID_CELL_WIDTH, height: GRID_HEADER_HEIGHT, paddingHorizontal: 4, paddingTop: 4, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID_BORDER }}>
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <GridIconButton icon="sort" direction={direction} label={`Sort titles by ${name} ranking`} onPress={onSort} />
      <GridIconButton icon="hide" label={`Hide ${name}`} onPress={onHide} />
    </View>
    <Text numberOfLines={2} style={{ fontWeight: '600', fontSize: 12, color: '#183a36' }}>{name}</Text>
  </View>;
}

export const PriorityCellView = React.memo(function PriorityCellView({ cell, titleName, clubName }: {
  cell: PriorityCell;
  titleName: string;
  clubName: string;
}) {
  const state = cell.rank === null ? 'not ranked' : `rank ${cell.rank}`;
  const label = `${clubName}, ${titleName}, ${state}${cell.assignment ? ', assigned' : ''}${cell.month ? `, scheduled ${cell.month}` : ''}`;
  return <View style={{ width: GRID_CELL_WIDTH, height: GRID_ROW_HEIGHT, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID_BORDER, justifyContent: 'center', padding: 8 }}
    accessible accessibilityLabel={label}>
    {cell.rank === null && !cell.assignment ?
      <Text style={{ color: '#9ca3af', fontSize: 12 }}>—</Text> :
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {cell.rank !== null && <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: '#e0e7ff' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e3a8a' }}>#{cell.rank}</Text>
          </View>}
          {cell.month && <Text style={{ fontSize: 11, color: '#374151' }}>{cell.month}</Text>}
        </View>
        <Text style={{ color: '#465c56', fontSize: 12 }}>{cell.assignment ? 'Assigned' : 'Ranked'}</Text>
      </>}
  </View>;
});
