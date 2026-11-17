import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { PriorityCell, PriorityMatrix } from '../domain/cycle-overview';
import type { Title } from '../domain/model';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 44;
const TITLE_WIDTH = 150;
const CONTESTED = '#b45309';

interface PriorityGridProps {
  matrix: PriorityMatrix;
  clubNameFor: (clubId: string) => string;
  titleFor: (titleId: string) => Title | undefined;
}

export function PriorityGridView({ matrix, clubNameFor, titleFor }: PriorityGridProps) {
  if (matrix.rows.length === 0) {
    return <Text style={{ color: '#6b7280' }}>No priorities have been selected for these clubs yet.</Text>;
  }
  return <ScrollView horizontal showsHorizontalScrollIndicator>
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <Text style={{ width: TITLE_WIDTH, fontWeight: '600' }}>Title</Text>
        {matrix.clubIds.map((clubId) => <Text key={clubId} numberOfLines={2}
          style={{ width: CELL_WIDTH, marginRight: 8, fontWeight: '600', fontSize: 12 }}>{clubNameFor(clubId)}</Text>)}
      </View>
      {matrix.rows.map((row) => {
        const title = titleFor(row.titleId);
        return <View key={row.titleId} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ width: TITLE_WIDTH, paddingRight: 8 }}>
            <Text numberOfLines={3} style={{ fontWeight: '600', fontSize: 12 }}>{title?.name ?? row.titleId}</Text>
            {row.contested && <Text style={{ color: CONTESTED, fontSize: 11, marginTop: 2 }}>Contested</Text>}
          </View>
          {row.cells.map((cell) => <PriorityCellView key={cell.clubId} cell={cell} title={title}
            clubName={clubNameFor(cell.clubId)} />)}
        </View>;
      })}
    </View>
  </ScrollView>;
}

function PriorityCellView({ cell, title, clubName }: { cell: PriorityCell; title: Title | undefined; clubName: string }) {
  const cellStyle = { width: CELL_WIDTH, marginRight: 8 };
  const rankLabel = cell.rank === null ? 'not ranked' : `rank ${cell.rank}`;
  const label = `${clubName}, ${title?.name ?? 'title'}, ${rankLabel}${cell.assignment ? ', assigned' : ''}${cell.month ? `, scheduled ${cell.month}` : ''}`;
  if (cell.rank === null && !cell.assignment) {
    return <View style={cellStyle} accessibilityLabel={label}>
      <View style={{ minHeight: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 12 }}>—</Text>
      </View>
    </View>;
  }
  return <View style={cellStyle} accessibilityLabel={label}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      {cell.rank !== null && <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: '#e0e7ff' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e3a8a' }}>#{cell.rank}</Text>
      </View>}
      {cell.month && <Text style={{ fontSize: 11, color: '#374151', marginLeft: 6 }}>{cell.month}</Text>}
    </View>
    <Text style={{ color: '#465c56', fontSize: 12 }}>{cell.assignment ? 'Assigned' : 'Ranked'}</Text>
  </View>;
}
