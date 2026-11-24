import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Animated, Text, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { PriorityRow } from '../domain/cycle-overview';
import type { Title } from '../domain/model';
import { Note } from './ui';
import {
  ClubHeaderCell, GRID_BODY_BACKGROUND, GRID_BORDER, GRID_CELL_WIDTH, GRID_HEADER_BACKGROUND, GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT,
  GridStatus, PriorityCellView, TitleCell, gridTitleWidth, nextSort, usePriorityGrid, type PriorityGridProps,
} from './priority-grid-shared';

type GridItem = { kind: 'club-header' } | { kind: 'row'; row: PriorityRow };

const STICKY_HEADER_INDICES = [0];
const CLUB_HEADER_ITEM: GridItem = { kind: 'club-header' };

interface NativeGridProps extends PriorityGridProps {
  header: ReactNode;
  footer: ReactNode;
}

export function NativePriorityGridView({ header, footer, matrix, clubNameFor, titleFor, onHideClub, hiddenTitleIds, setHiddenTitleIds,
  sortClub, setSortClub, sortTitle, setSortTitle }: NativeGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const titleWidth = gridTitleWidth(windowWidth);
  const { activeClub, activeTitle, sorted } = usePriorityGrid(matrix, hiddenTitleIds, sortClub, sortTitle);
  const contentWidth = titleWidth + sorted.clubIds.length * GRID_CELL_WIDTH;
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }), [scrollX]);

  const data = useMemo<GridItem[]>(() => sorted.clubIds.length
    ? [CLUB_HEADER_ITEM, ...sorted.rows.map((row) => ({ kind: 'row' as const, row }))]
    : [], [sorted]);
  const extraData = useMemo(() => ({ activeClub, activeTitle }), [activeClub, activeTitle]);

  const renderItem = useCallback(({ item }: { item: GridItem }) => {
    if (item.kind === 'club-header') {
      return <View style={{ flexDirection: 'row', width: contentWidth, height: GRID_HEADER_HEIGHT, backgroundColor: GRID_HEADER_BACKGROUND }}>
        <Animated.View style={{ width: titleWidth, height: GRID_HEADER_HEIGHT, zIndex: 1, justifyContent: 'flex-end', padding: 8,
          backgroundColor: GRID_HEADER_BACKGROUND, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID_BORDER,
          transform: [{ translateX: scrollX }] }}>
          <Text style={{ fontWeight: '700', color: '#183a36' }}>Title</Text>
        </Animated.View>
        {sorted.clubIds.map((clubId) => <ClubHeaderCell key={clubId} name={clubNameFor(clubId)}
          direction={activeClub?.id === clubId ? activeClub.direction : null}
          onSort={() => setSortClub((current) => nextSort(current, clubId))}
          onHide={() => onHideClub(clubId)} />)}
      </View>;
    }
    const { row } = item;
    const title: Title | undefined = titleFor(row.titleId);
    return <View style={{ flexDirection: 'row', width: contentWidth, height: GRID_ROW_HEIGHT }}>
      <Animated.View style={{ width: titleWidth, height: GRID_ROW_HEIGHT, zIndex: 1, backgroundColor: GRID_BODY_BACKGROUND,
        transform: [{ translateX: scrollX }] }}>
        <TitleCell title={title} rankedClubCount={row.rankedClubCount} contested={row.contested}
          direction={activeTitle?.id === row.titleId ? activeTitle.direction : null}
          onSort={() => setSortTitle((current) => nextSort(current, row.titleId))}
          onHide={() => setHiddenTitleIds((ids) => [...ids, row.titleId])} />
      </Animated.View>
      {row.cells.map((cell) => <PriorityCellView key={cell.clubId} cell={cell}
        titleName={title?.name ?? 'Unavailable title'} clubName={clubNameFor(cell.clubId)} />)}
    </View>;
  }, [activeClub, activeTitle, clubNameFor, contentWidth, onHideClub, scrollX, setHiddenTitleIds, setSortClub, setSortTitle, sorted.clubIds, titleFor, titleWidth]);

  return <View style={{ flex: 1 }} onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}>
    {viewportHeight > 0 && <Animated.ScrollView horizontal showsHorizontalScrollIndicator scrollEventThrottle={16}
      onScroll={onScroll} style={{ height: viewportHeight }}>
      <FlashList style={{ width: contentWidth, height: viewportHeight }}
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.kind === 'club-header' ? 'club-header' : item.row.titleId}
        getItemType={(item) => item.kind}
        extraData={extraData}
        stickyHeaderIndices={STICKY_HEADER_INDICES}
        ListHeaderComponent={<View style={{ width: windowWidth, gap: 12, paddingBottom: 12 }}>
          {header}
          <GridStatus hiddenCount={hiddenTitleIds.length} onClearHidden={() => setHiddenTitleIds([])}
            activeClub={activeClub && { name: clubNameFor(activeClub.id), direction: activeClub.direction }}
            activeTitle={activeTitle && { name: titleFor(activeTitle.id)?.name ?? 'unavailable title', direction: activeTitle.direction }}
            onReset={() => { setSortClub(null); setSortTitle(null); }} />
          {matrix.clubIds.length === 0 && <Note>No clubs shown.</Note>}
          {matrix.clubIds.length > 0 && sorted.rows.length === 0 && <Text style={{ color: '#6b7280' }}>
            {matrix.rows.length > 0 ? 'All available titles are hidden.' : 'No priorities or assignments for these clubs yet.'}
          </Text>}
        </View>}
        ListFooterComponent={<View style={{ width: windowWidth, gap: 18, marginTop: 18, paddingBottom: 24 }}>{footer}</View>}
      />
    </Animated.ScrollView>}
  </View>;
}
