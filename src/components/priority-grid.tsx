import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TitleCover } from './title-cover';
import { Action } from './ui';
import type { PriorityCell, PriorityMatrix } from '../domain/cycle-overview';
import type { Title } from '../domain/model';

const CELL_WIDTH = 116;
const TITLE_WIDTH = 220;
const CONTESTED = '#b45309';

interface PriorityGridProps {
  matrix: PriorityMatrix;
  clubNameFor: (clubId: string) => string;
  titleFor: (titleId: string) => Title | undefined;
  onHideClub: (clubId: string) => void;
}

export function PriorityGridView({ matrix, clubNameFor, titleFor, onHideClub }: PriorityGridProps) {
  return <ScrollView horizontal showsHorizontalScrollIndicator>
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, borderColor: '#d6e5d8', paddingBottom: 8 }}>
        <Text style={{ width: TITLE_WIDTH, fontWeight: '700', color: '#183a36' }}>Title</Text>
        {matrix.clubIds.map((clubId) => <View key={clubId} style={{ width: CELL_WIDTH, paddingRight: 8, gap: 6, alignItems: 'flex-start' }}>
          <Text style={{ fontWeight: '600', fontSize: 12, color: '#183a36' }}>{clubNameFor(clubId)}</Text>
          <Action title="Hide" accessibilityLabel={`Hide ${clubNameFor(clubId)}`} onPress={() => onHideClub(clubId)} />
        </View>)}
      </View>
      {matrix.rows.length === 0 && <Text style={{ color: '#6b7280', marginTop: 12 }}>No priorities or assignments for these clubs yet.</Text>}
      {matrix.rows.map((row) => {
        const title = titleFor(row.titleId);
        const countLabel = `${row.rankedClubCount} ${row.rankedClubCount === 1 ? 'club ranks' : 'clubs rank'} this title`;
        return <View key={row.titleId} style={{ flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingVertical: 8 }}>
          <View style={{ width: TITLE_WIDTH, paddingRight: 8, flexDirection: 'row', alignItems: 'flex-start' }}>
            {title && (title.coverUrl || title.isbn.trim()) ?
              <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 40, height: 60, marginRight: 8 }} /> :
              <View style={{ width: 40, height: 60, marginRight: 8, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>No cover</Text>
              </View>}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 12 }}>{title?.name ?? 'Unavailable title'}</Text>
              {row.contested && <Text accessibilityLabel={`Contested, ${countLabel}`} style={{ color: CONTESTED, fontSize: 11, marginTop: 2 }}>Contested · {row.rankedClubCount} clubs rank</Text>}
            </View>
          </View>
          {row.cells.map((cell) => <PriorityCellView key={cell.clubId} cell={cell} title={title}
            clubName={clubNameFor(cell.clubId)} />)}
        </View>;
      })}
    </View>
  </ScrollView>;
}

function PriorityCellView({ cell, title, clubName }: { cell: PriorityCell; title: Title | undefined; clubName: string }) {
  const rankLabel = cell.rank === null ? 'not ranked' : `rank ${cell.rank}`;
  const label = `${clubName}, ${title?.name ?? 'unavailable title'}, ${rankLabel}${cell.assignment ? ', assigned' : ''}${cell.month ? `, scheduled ${cell.month}` : ''}`;
  return <View style={{ width: CELL_WIDTH, paddingRight: 8, justifyContent: 'center' }} accessible accessibilityLabel={label}>
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
}
