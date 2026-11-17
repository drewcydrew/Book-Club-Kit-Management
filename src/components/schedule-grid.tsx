import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TitleCover } from './title-cover';
import { Action } from './ui';
import { SCHEDULE_CLUB_WIDTH, scheduleGridSizing } from './schedule-layout';
import type { ScheduleGrid as ScheduleGridData, GridCell } from '../domain/cycle-overview';
import type { Assignment, Title } from '../domain/model';

const CLASH = '#a22525';

interface ScheduleGridProps {
  grid: ScheduleGridData;
  wide: boolean;
  clubNameFor: (clubId: string) => string;
  titleFor: (assignment: Assignment) => Title | undefined;
  expandedId: string | null;
  showProblems: boolean;
  onToggle: (assignmentId: string) => void;
  renderDetail: (assignment: Assignment) => React.ReactNode;
  selectedSlotId?: string | null;
  onSelectSlot?: (slotId: string) => void;
  clubSummaryFor?: (clubId: string) => string;
  onHideClub?: (clubId: string) => void;
}

export function ScheduleGridView({ grid, wide, clubNameFor, titleFor, expandedId, showProblems, onToggle, renderDetail, selectedSlotId, onSelectSlot, clubSummaryFor, onHideClub }: ScheduleGridProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const { cellWidth, gap } = scheduleGridSizing(containerWidth, wide);
  if (grid.rows.length === 0) return null;
  return <View onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
    {grid.rows.map((row) => {
      const expandedCell = row.cells.find((cell) => onSelectSlot ? cell.slot?.id === selectedSlotId : cell.assignment && cell.assignment.id === expandedId);
      return <View key={row.clubId} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: SCHEDULE_CLUB_WIDTH, paddingRight: 8 }}>
            <Text numberOfLines={3} style={{ fontWeight: '600' }}>{clubNameFor(row.clubId)}</Text>
            {clubSummaryFor && <Text>{clubSummaryFor(row.clubId)}</Text>}
            {onHideClub && <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <Action title="Hide" accessibilityLabel={`Hide ${clubNameFor(row.clubId)}`} onPress={() => onHideClub(row.clubId)} />
            </View>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator style={wide ? { flex: 1, minWidth: 0 } : undefined}>
            <View style={{ flexDirection: 'row' }}>
              {row.cells.map((cell, index) => <GridCellView key={cell.month} cell={cell} title={cell.assignment ? titleFor(cell.assignment) : undefined}
                cellWidth={cellWidth} gap={wide && index === row.cells.length - 1 ? 0 : gap}
                expanded={onSelectSlot ? cell.slot?.id === selectedSlotId : !!cell.assignment && cell.assignment.id === expandedId}
                showProblems={showProblems} onToggle={onToggle} onSelectSlot={onSelectSlot} clubName={clubNameFor(row.clubId)} />)}
            </View>
          </ScrollView>
        </View>
        {!onSelectSlot && expandedCell?.assignment && <View style={{ marginLeft: SCHEDULE_CLUB_WIDTH }}>{renderDetail(expandedCell.assignment)}</View>}
      </View>;
    })}
  </View>;
}

function GridCellView({ cell, title, cellWidth, gap, expanded, showProblems, onToggle, onSelectSlot, clubName }: {
  cell: GridCell;
  title: Title | undefined;
  cellWidth: number;
  gap: number;
  expanded: boolean;
  showProblems: boolean;
  onToggle: (assignmentId: string) => void;
  onSelectSlot?: (slotId: string) => void;
  clubName: string;
}) {
  const cellStyle = { width: cellWidth, marginRight: gap };
  const coverHeight = cellWidth * 1.5;
  if (!cell.slot) {
    return <View style={cellStyle} accessibilityLabel={`${cell.month}, no meeting in this month`}>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: coverHeight, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 12 }}>—</Text>
      </View>
    </View>;
  }
  if (!cell.assignment || !title) {
    const unavailable = !!cell.assignment;
    const content = <>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: coverHeight, borderRadius: 6, borderWidth: expanded ? 2 : 1, borderStyle: 'dashed', borderColor: expanded ? '#2563eb' : '#9ca3af', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 12 }}>{unavailable ? 'Unavailable title' : 'Not assigned'}</Text>
      </View>
    </>;
    return onSelectSlot
      ? <Pressable style={cellStyle} accessibilityRole="button" accessibilityLabel={`${clubName}, ${cell.month}, ${unavailable ? 'unavailable title' : 'not assigned'}`} accessibilityState={{ selected: expanded }} onPress={() => onSelectSlot(cell.slot!.id)}>{content}</Pressable>
      : cell.assignment
        ? <Pressable style={cellStyle} accessibilityRole="button" accessibilityLabel={`${clubName}, ${cell.month}, unavailable title`} accessibilityState={{ expanded }} onPress={() => onToggle(cell.assignment!.id)}>{content}</Pressable>
        : <View style={cellStyle} accessibilityLabel={`${cell.month}, not yet assigned`}>{content}</View>;
  }
  const clash = showProblems && !!cell.problem;
  const assignment = cell.assignment;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${onSelectSlot ? `${clubName}, ` : ''}${title.name}, ${cell.month}${clash ? ', needs review' : ''}`}
    accessibilityState={onSelectSlot ? { selected: expanded } : { expanded }} onPress={() => onSelectSlot ? onSelectSlot(assignment.slotId) : onToggle(assignment.id)} style={cellStyle}>
    <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
    <View style={{ borderRadius: 6, borderWidth: 2, borderColor: clash ? CLASH : expanded ? '#2563eb' : 'transparent', overflow: 'hidden' }}>
      <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: cellWidth - 4, height: coverHeight, marginRight: 0, marginBottom: 0 }} />
      {clash && <View style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: CLASH, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>!</Text>
      </View>}
    </View>
    <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', marginTop: 4 }}>{title.name}</Text>
  </Pressable>;
}
