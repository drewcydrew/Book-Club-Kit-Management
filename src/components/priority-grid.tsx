import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { TitleCover } from './title-cover';
import { Action } from './ui';
import { sortPriorityMatrix } from '../domain/cycle-overview';
import type { PriorityCell, PriorityMatrix, PrioritySort } from '../domain/cycle-overview';
import type { Title } from '../domain/model';

const CELL_WIDTH = 116;
const BORDER = '#cbd8d2';
const CONTESTED = '#b45309';
const HEADER_ROW = '\u0000header';

interface PriorityGridProps {
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

function nextSort(current: PrioritySort | null, id: string): PrioritySort {
  return { id, direction: current?.id === id && current.direction === 'ascending' ? 'descending' : 'ascending' };
}

export const PriorityGridView = React.memo(function PriorityGridView({ matrix, clubNameFor, titleFor, onHideClub, hiddenTitleIds, setHiddenTitleIds, sortClub, setSortClub, sortTitle, setSortTitle }: PriorityGridProps) {
  const { width } = useWindowDimensions();
  const titleWidth = Math.min(220, Math.max(156, Math.floor(width * 0.42)));
  const [measurements, setMeasurements] = useState<Record<string, Record<string, number>>>({});
  const visibleMatrix = useMemo(() => ({ ...matrix, rows: matrix.rows.filter((row) => !hiddenTitleIds.includes(row.titleId)) }), [matrix, hiddenTitleIds]);
  const activeClub = sortClub && matrix.clubIds.includes(sortClub.id) ? sortClub : null;
  const activeTitle = sortTitle && visibleMatrix.rows.some((row) => row.titleId === sortTitle.id) ? sortTitle : null;
  const sorted = useMemo(() => sortPriorityMatrix(visibleMatrix, activeClub, activeTitle), [visibleMatrix, activeClub, activeTitle]);

  function measure(row: string, part: string, height: number) {
    const rounded = Math.ceil(height);
    setMeasurements((previous) => previous[row]?.[part] === rounded ? previous : {
      ...previous,
      [row]: { ...previous[row], [part]: rounded },
    });
  }
  function rowHeight(row: string, minimum: number) {
    const sizes = measurements[row];
    return Math.max(minimum, (sizes?.title ?? 0) + 1, ...sorted.clubIds.map((id) => (sizes?.[`club:${id}`] ?? 0) + 1));
  }
  const headerHeight = rowHeight(HEADER_ROW, 72);

  return <View style={{ gap: 8 }}>
    <Text style={{ color: '#465c56', fontSize: 12 }}>
      Select an arrow to sort by that club or title; select it again to reverse. Unranked entries stay last. Use the eye to hide a row or club.
    </Text>
    {hiddenTitleIds.length > 0 && <View style={{ alignSelf: 'flex-start' }}>
      <Action title={`Clear hidden titles (${hiddenTitleIds.length})`} onPress={() => setHiddenTitleIds([])} />
    </View>}
    {(activeClub || activeTitle) && <View style={{ gap: 4 }}>
      {activeClub && <Text style={{ color: '#244c40' }}>Titles sorted by {clubNameFor(activeClub.id)} · {activeClub.direction}</Text>}
      {activeTitle && <Text style={{ color: '#244c40' }}>Clubs sorted by {titleFor(activeTitle.id)?.name ?? 'unavailable title'} · {activeTitle.direction}</Text>}
      <View style={{ alignSelf: 'flex-start' }}><Action title="Reset sorting" onPress={() => { setSortClub(null); setSortTitle(null); }} /></View>
    </View>}
    {matrix.clubIds.length > 0 && <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderLeftWidth: 1, borderColor: BORDER }}>
        <View style={{ width: titleWidth }}>
          <View style={{ height: headerHeight, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, padding: 8, justifyContent: 'flex-end', backgroundColor: '#f1f6f2' }}>
            <Text style={{ fontWeight: '700', color: '#183a36' }}>Title</Text>
          </View>
          {sorted.rows.map((row) => {
            const title = titleFor(row.titleId);
            const countLabel = `${row.rankedClubCount} ${row.rankedClubCount === 1 ? 'club ranks' : 'clubs rank'} this title`;
            const direction = activeTitle?.id === row.titleId ? activeTitle.direction : null;
            return <View key={row.titleId} style={{ height: rowHeight(row.titleId, 80), borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER }}>
              <View onLayout={(event) => measure(row.titleId, 'title', event.nativeEvent.layout.height)}
                style={{ padding: 8, flexDirection: 'row', alignItems: 'flex-start' }}>
                {title && (title.coverUrl || title.isbn.trim()) ?
                  <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 40, height: 60, marginRight: 8 }} /> :
                  <View style={{ width: 40, height: 60, marginRight: 8, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>No cover</Text>
                  </View>}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <GridIconButton icon="sort" direction={direction}
                      label={`Sort clubs by ${title?.name ?? 'unavailable title'} ranking`}
                      onPress={() => setSortTitle((current) => nextSort(current, row.titleId))} />
                    <GridIconButton icon="hide" label={`Hide title ${title?.name ?? 'unavailable title'}`}
                      onPress={() => setHiddenTitleIds((ids) => [...ids, row.titleId])} />
                  </View>
                  <Text style={{ fontWeight: '600', fontSize: 12 }}>{title?.name ?? 'Unavailable title'}</Text>
                  {row.contested && <Text accessibilityLabel={`Contested, ${countLabel}`} style={{ color: CONTESTED, fontSize: 11, marginTop: 2 }}>Contested · {row.rankedClubCount} clubs rank</Text>}
                </View>
              </View>
            </View>;
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1, minWidth: 0 }}>
          <View>
            <View style={{ height: headerHeight, flexDirection: 'row', backgroundColor: '#f1f6f2' }}>
              {sorted.clubIds.map((clubId) => {
                const direction = activeClub?.id === clubId ? activeClub.direction : null;
                return <View key={clubId} style={{ width: CELL_WIDTH, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER }}>
                  <View onLayout={(event) => measure(HEADER_ROW, `club:${clubId}`, event.nativeEvent.layout.height)} style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <GridIconButton icon="sort" direction={direction} label={`Sort titles by ${clubNameFor(clubId)} ranking`}
                        onPress={() => setSortClub((current) => nextSort(current, clubId))} />
                      <GridIconButton icon="hide" label={`Hide ${clubNameFor(clubId)}`} onPress={() => onHideClub(clubId)} />
                    </View>
                    <Text style={{ fontWeight: '600', fontSize: 12, color: '#183a36' }}>{clubNameFor(clubId)}</Text>
                  </View>
                </View>;
              })}
            </View>
            {sorted.rows.map((row) => <View key={row.titleId} style={{ height: rowHeight(row.titleId, 80), flexDirection: 'row' }}>
              {row.cells.map((cell) => <PriorityCellView key={cell.clubId} cell={cell} title={titleFor(row.titleId)}
                clubName={clubNameFor(cell.clubId)} onMeasure={(height) => measure(row.titleId, `club:${cell.clubId}`, height)} />)}
            </View>)}
          </View>
        </ScrollView>
      </View>
      {sorted.rows.length === 0 && <Text style={{ color: '#6b7280' }}>
        {matrix.rows.length > 0 ? 'All available titles are hidden.' : 'No priorities or assignments for these clubs yet.'}
      </Text>}
    </>}
  </View>;
});

function GridIconButton({ icon, label, direction, onPress }: {
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

function PriorityCellView({ cell, title, clubName, onMeasure }: { cell: PriorityCell; title: Title | undefined; clubName: string; onMeasure: (height: number) => void }) {
  const rankLabel = cell.rank === null ? 'not ranked' : `rank ${cell.rank}`;
  const label = `${clubName}, ${title?.name ?? 'unavailable title'}, ${rankLabel}${cell.assignment ? ', assigned' : ''}${cell.month ? `, scheduled ${cell.month}` : ''}`;
  return <View style={{ width: CELL_WIDTH, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, justifyContent: 'center' }}
    accessible accessibilityLabel={label}>
    <View onLayout={(event) => onMeasure(event.nativeEvent.layout.height)} style={{ padding: 8 }}>
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
    </View>
  </View>;
}
