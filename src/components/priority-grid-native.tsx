import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { priorityCellsForTitle, priorityRowsForClub, type PriorityCell, type PriorityMatrix, type PriorityRow, type PrioritySort } from '../domain/cycle-overview';
import type { Title } from '../domain/model';
import { SearchPicker } from './search-picker';
import { TitleCover } from './title-cover';
import { Action, Actions, Note } from './ui';

interface Props {
  matrix: PriorityMatrix;
  clubNameFor: (id: string) => string;
  titleFor: (id: string) => Title | undefined;
  onHideClub: (id: string) => void;
  header: ReactNode;
  footer: ReactNode;
}

function cellDescription(cell: PriorityCell): string {
  return [
    cell.rank === null ? 'Not ranked' : `Rank ${cell.rank}`,
    cell.assignment ? 'Assigned' : cell.rank === null ? '' : 'Ranked',
    cell.month ? `Scheduled ${cell.month}` : '',
  ].filter(Boolean).join(' · ');
}

export function NativePriorityGridView({ matrix, clubNameFor, titleFor, onHideClub, header, footer }: Props) {
  const [selectedClubId, setSelectedClubId] = useState(matrix.clubIds[0] ?? '');
  const [titleDirection, setTitleDirection] = useState<PrioritySort['direction']>('ascending');
  const [clubDirection, setClubDirection] = useState<PrioritySort['direction']>('ascending');
  const [hiddenTitleIds, setHiddenTitleIds] = useState<string[]>([]);
  const [expandedTitleId, setExpandedTitleId] = useState<string | null>(null);
  const selectedClub = matrix.clubIds.includes(selectedClubId) ? selectedClubId : matrix.clubIds[0] ?? '';
  if (selectedClub !== selectedClubId) setSelectedClubId(selectedClub);

  const rows = useMemo(() => priorityRowsForClub(matrix, selectedClub, hiddenTitleIds, titleDirection),
    [matrix, selectedClub, hiddenTitleIds, titleDirection]);
  const clubOptions = useMemo(() => matrix.clubIds.map((id) => ({
    id, label: clubNameFor(id), detail: '', group: 'all',
  })), [matrix.clubIds, clubNameFor]);

  const renderItem = useCallback(({ item: row }: { item: PriorityRow }) => {
    const title = titleFor(row.titleId);
    const name = title?.name ?? 'Unavailable title';
    const selectedCell = row.cells.find((cell) => cell.clubId === selectedClub);
    const expanded = expandedTitleId === row.titleId;
    const clubCells = expanded ? priorityCellsForTitle(matrix, row, clubDirection) : [];
    return <View style={{ backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#cbd8d2', marginBottom: 8, padding: 10, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${clubNameFor(selectedClub)}, ${selectedCell ? cellDescription(selectedCell) : 'not ranked'}, ${row.rankedClubCount} clubs rank this title`}
        onPress={() => setExpandedTitleId(expanded ? null : row.titleId)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
        {title && (title.coverUrl || title.isbn.trim()) ?
          <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 40, height: 60, marginRight: 0 }} /> :
          <View style={{ width: 40, height: 60, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>No cover</Text>
          </View>}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '700', color: '#183a36' }}>{name}</Text>
          <Text style={{ color: '#465c56' }}>{selectedCell ? cellDescription(selectedCell) : 'Not ranked'}</Text>
          <Text style={{ color: row.contested ? '#b45309' : '#465c56', fontSize: 12 }}>
            {row.contested ? 'Contested · ' : ''}{row.rankedClubCount} {row.rankedClubCount === 1 ? 'club ranks' : 'clubs rank'} this title
          </Text>
        </View>
        <Text style={{ color: '#244c40' }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && <>
        <Actions>
          <Action title={`Club ranks: ${clubDirection === 'ascending' ? 'highest priority first' : 'lowest priority first'}`}
            description="Reverse the club ranking order"
            onPress={() => setClubDirection((current) => current === 'ascending' ? 'descending' : 'ascending')} />
          <Action title="Hide title" accessibilityLabel={`Hide title ${name}`} onPress={() => {
            setHiddenTitleIds((ids) => [...ids, row.titleId]);
            setExpandedTitleId(null);
          }} />
        </Actions>
        {clubCells.map((cell) => <View key={cell.clubId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: '#e1e8e3', paddingTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#183a36', fontWeight: '600' }}>{clubNameFor(cell.clubId)}</Text>
            <Text style={{ color: '#465c56' }}>{cellDescription(cell)}</Text>
          </View>
          <Action title="Hide club" accessibilityLabel={`Hide ${clubNameFor(cell.clubId)}`} onPress={() => onHideClub(cell.clubId)} />
        </View>)}
      </>}
    </View>;
  }, [clubDirection, clubNameFor, expandedTitleId, matrix, onHideClub, selectedClub, titleFor]);

  return <FlatList style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}
    data={rows} renderItem={renderItem} keyExtractor={(row) => row.titleId}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      {header}
      {selectedClub && <>
        <Note>Reviewing {clubNameFor(selectedClub)}. Choose a club to review its title rankings; expand a title to compare all shown clubs.</Note>
        <SearchPicker label="Review club" options={clubOptions} selectedId={selectedClub}
          groups={[{ value: 'all', label: 'All' }]} onSelect={setSelectedClubId} />
        <Actions>
          <Action title={`Title ranks: ${titleDirection === 'ascending' ? 'highest priority first' : 'lowest priority first'}`}
            description="Reverse the title ranking order"
            onPress={() => setTitleDirection((current) => current === 'ascending' ? 'descending' : 'ascending')} />
          {hiddenTitleIds.length > 0 && <Action title={`Clear hidden titles (${hiddenTitleIds.length})`} onPress={() => setHiddenTitleIds([])} />}
        </Actions>
        <Note>Unranked titles and clubs appear last.</Note>
      </>}
    </View>}
    ListEmptyComponent={selectedClub ? <Text style={{ color: '#6b7280' }}>
      {matrix.rows.length ? 'All available titles are hidden.' : 'No priorities or assignments for these clubs yet.'}
    </Text> : undefined}
    ListFooterComponent={<View style={{ gap: 18, marginTop: 18 }}>{footer}</View>}
  />;
}
