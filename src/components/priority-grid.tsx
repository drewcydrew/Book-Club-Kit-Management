import React from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ClubHeaderCell, GRID_BORDER, GRID_HEADER_BACKGROUND, GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT, GridStatus, PriorityCellView, TitleCell, gridTitleWidth, nextSort, usePriorityGrid, type PriorityGridProps } from './priority-grid-shared';

export const PriorityGridView = React.memo(function PriorityGridView({ matrix, clubNameFor, titleFor, onHideClub, hiddenTitleIds, setHiddenTitleIds, sortClub, setSortClub, sortTitle, setSortTitle }: PriorityGridProps) {
  const { width } = useWindowDimensions();
  const titleWidth = gridTitleWidth(width);
  const { activeClub, activeTitle, sorted } = usePriorityGrid(matrix, hiddenTitleIds, sortClub, sortTitle);

  return <View style={{ gap: 8 }}>
    <GridStatus hiddenCount={hiddenTitleIds.length} onClearHidden={() => setHiddenTitleIds([])}
      activeClub={activeClub && { name: clubNameFor(activeClub.id), direction: activeClub.direction }}
      activeTitle={activeTitle && { name: titleFor(activeTitle.id)?.name ?? 'unavailable title', direction: activeTitle.direction }}
      onReset={() => { setSortClub(null); setSortTitle(null); }} />
    {matrix.clubIds.length > 0 && <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderLeftWidth: 1, borderColor: GRID_BORDER }}>
        <View style={{ width: titleWidth }}>
          <View style={{ height: GRID_HEADER_HEIGHT, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID_BORDER, padding: 8, justifyContent: 'flex-end', backgroundColor: GRID_HEADER_BACKGROUND }}>
            <Text style={{ fontWeight: '700', color: '#183a36' }}>Title</Text>
          </View>
          {sorted.rows.map((row) => <TitleCell key={row.titleId} title={titleFor(row.titleId)} rankedClubCount={row.rankedClubCount} contested={row.contested}
            direction={activeTitle?.id === row.titleId ? activeTitle.direction : null}
            onSort={() => setSortTitle((current) => nextSort(current, row.titleId))}
            onHide={() => setHiddenTitleIds((ids) => [...ids, row.titleId])} />)}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1, minWidth: 0 }}>
          <View>
            <View style={{ height: GRID_HEADER_HEIGHT, flexDirection: 'row', backgroundColor: GRID_HEADER_BACKGROUND }}>
              {sorted.clubIds.map((clubId) => <ClubHeaderCell key={clubId} name={clubNameFor(clubId)}
                direction={activeClub?.id === clubId ? activeClub.direction : null}
                onSort={() => setSortClub((current) => nextSort(current, clubId))}
                onHide={() => onHideClub(clubId)} />)}
            </View>
            {sorted.rows.map((row) => <View key={row.titleId} style={{ height: GRID_ROW_HEIGHT, flexDirection: 'row' }}>
              {row.cells.map((cell) => <PriorityCellView key={cell.clubId} cell={cell}
                titleName={titleFor(row.titleId)?.name ?? 'Unavailable title'} clubName={clubNameFor(cell.clubId)} />)}
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

