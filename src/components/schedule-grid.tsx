import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TitleCover } from './title-cover';
import type { ScheduleGrid as ScheduleGridData, GridCell } from '../domain/cycle-overview';
import type { Assignment, Title } from '../domain/model';

const CELL_WIDTH = 96;
const COVER_HEIGHT = 144;
const CLUB_WIDTH = 140;
const CLASH = '#a22525';

interface ScheduleGridProps {
  grid: ScheduleGridData;
  clubNameFor: (clubId: string) => string;
  titleFor: (assignment: Assignment) => Title | undefined;
  expandedId: string | null;
  showProblems: boolean;
  onToggle: (assignmentId: string) => void;
  renderDetail: (assignment: Assignment) => React.ReactNode;
}

export function ScheduleGridView({ grid, clubNameFor, titleFor, expandedId, showProblems, onToggle, renderDetail }: ScheduleGridProps) {
  if (grid.rows.length === 0) return null;
  return <View>
    {grid.rows.map((row) => {
      const expandedCell = row.cells.find((cell) => cell.assignment && cell.assignment.id === expandedId);
      return <View key={row.clubId} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text numberOfLines={3} style={{ width: CLUB_WIDTH, fontWeight: '600', paddingRight: 8 }}>{clubNameFor(row.clubId)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ flexDirection: 'row' }}>
              {row.cells.map((cell) => <GridCellView key={cell.month} cell={cell} title={cell.assignment ? titleFor(cell.assignment) : undefined}
                expanded={!!cell.assignment && cell.assignment.id === expandedId} showProblems={showProblems} onToggle={onToggle} />)}
            </View>
          </ScrollView>
        </View>
        {expandedCell?.assignment && <View style={{ marginLeft: CLUB_WIDTH }}>{renderDetail(expandedCell.assignment)}</View>}
      </View>;
    })}
  </View>;
}

function GridCellView({ cell, title, expanded, showProblems, onToggle }: {
  cell: GridCell;
  title: Title | undefined;
  expanded: boolean;
  showProblems: boolean;
  onToggle: (assignmentId: string) => void;
}) {
  const cellStyle = { width: CELL_WIDTH, marginRight: 8 };
  if (!cell.slot) {
    return <View style={cellStyle} accessibilityLabel={`${cell.month}, no meeting in this month`}>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: COVER_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 12 }}>—</Text>
      </View>
    </View>;
  }
  if (!cell.assignment || !title) {
    return <View style={cellStyle} accessibilityLabel={`${cell.month}, not yet assigned`}>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: COVER_HEIGHT, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 12 }}>Not assigned</Text>
      </View>
    </View>;
  }
  const clash = showProblems && !!cell.problem;
  const assignment = cell.assignment;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title.name}, ${cell.month}${clash ? ', needs review' : ''}`}
    accessibilityState={{ expanded }} onPress={() => onToggle(assignment.id)} style={cellStyle}>
    <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
    <View style={{ borderRadius: 6, borderWidth: 2, borderColor: clash ? CLASH : expanded ? '#2563eb' : 'transparent', overflow: 'hidden' }}>
      <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: CELL_WIDTH - 4, height: COVER_HEIGHT, marginRight: 0, marginBottom: 0 }} />
      {clash && <View style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: CLASH, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>!</Text>
      </View>}
    </View>
    <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', marginTop: 4 }}>{title.name}</Text>
  </Pressable>;
}
