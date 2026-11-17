import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TitleCover } from './title-cover';
import { Action } from './ui';
import { SCHEDULE_CLUB_WIDTH, SCHEDULE_CELL_LABEL_HEIGHT, SCHEDULE_ROW_GAP, scheduleCoverHeight, scheduleGridSizing, scheduleRowHeight } from './schedule-layout';
import { FadeCell, HighlightPath, useReduceMotion, type HighlightStop } from './schedule-highlight';
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
  onAddSlot?: (clubId: string, month: string) => void;
  onGenerateClub?: (clubId: string, months: string[]) => void;
  clubResult?: { clubId: string; text: string; problems: string[] } | null;
  clubSummaryFor?: (clubId: string) => string;
  onHideClub?: (clubId: string) => void;
  sharedLayout?: boolean;
  highlightTitleId?: string | null;
}

export function ScheduleGridView({ grid, wide, clubNameFor, titleFor, expandedId, showProblems, onToggle, renderDetail, selectedSlotId, onSelectSlot, onAddSlot, onGenerateClub, clubResult = null, clubSummaryFor, onHideClub, sharedLayout = false, highlightTitleId = null }: ScheduleGridProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [planning, setPlanning] = useState<{ clubId: string; months: string[] } | null>(null);
  const reduceMotion = useReduceMotion();
  const { cellWidth, gap } = scheduleGridSizing(containerWidth, wide);
  if (grid.rows.length === 0) return null;
  const highlighting = !!highlightTitleId;
  const isMatch = (cell: GridCell) => highlighting && !!cell.assignment && titleFor(cell.assignment)?.id === highlightTitleId;
  const rows = highlighting ? grid.rows.filter((row) => row.cells.some(isMatch)) : grid.rows;
  const expandedCellFor = (row: ScheduleGridData['rows'][number]) => row.cells.find((cell) => onSelectSlot ? cell.slot?.id === selectedSlotId : cell.assignment && cell.assignment.id === expandedId);
  const cellsFor = (row: ScheduleGridData['rows'][number]) => row.cells.map((cell) => <FadeCell key={cell.month} dimmed={highlighting && !isMatch(cell)} reduceMotion={reduceMotion}
    style={{ width: cellWidth, marginRight: wide && cell === row.cells[row.cells.length - 1] ? 0 : gap }}>
    <GridCellView cell={cell} title={cell.assignment ? titleFor(cell.assignment) : undefined} cellWidth={cellWidth}
      expanded={onSelectSlot ? cell.slot?.id === selectedSlotId : !!cell.assignment && cell.assignment.id === expandedId}
      showProblems={showProblems} onToggle={onToggle} onSelectSlot={onSelectSlot}
      onAddSlot={onAddSlot ? () => onAddSlot(row.clubId, cell.month) : undefined} clubName={clubNameFor(row.clubId)} />
  </FadeCell>);
  const clubColumn = (row: ScheduleGridData['rows'][number]) => <View style={{ width: SCHEDULE_CLUB_WIDTH, paddingRight: 8 }}>
    <Text numberOfLines={3} style={{ fontWeight: '600' }}>{clubNameFor(row.clubId)}</Text>
    {clubSummaryFor && <Text>{clubSummaryFor(row.clubId)}</Text>}
    {onHideClub && <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
      <Action title="Hide" accessibilityLabel={`Hide ${clubNameFor(row.clubId)}`} onPress={() => onHideClub(row.clubId)} />
    </View>}
    {onGenerateClub && <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
      <Action title="Generate assignments" accessibilityLabel={`Generate assignments for ${clubNameFor(row.clubId)}`}
        onPress={() => setPlanning({ clubId: row.clubId, months: [...grid.months] })} />
    </View>}
  </View>;
  const detail = (row: ScheduleGridData['rows'][number]) => {
    if (onGenerateClub && planning?.clubId === row.clubId) {
      const toggle = (month: string) => setPlanning({ clubId: row.clubId,
        months: planning.months.includes(month) ? planning.months.filter((item) => item !== month) : [...planning.months, month] });
      return <View style={{ marginLeft: SCHEDULE_CLUB_WIDTH, marginBottom: 8 }}>
        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Generate assignments for {clubNameFor(row.clubId)}</Text>
        <Text style={{ color: '#374151', marginBottom: 6 }}>Only empty meetings in the ticked months are filled. Existing assignments and other clubs are not changed.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {grid.months.map((month) => {
            const checked = planning.months.includes(month);
            return <Pressable key={month} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={month}
              onPress={() => toggle(month)} style={{ marginRight: 12, marginBottom: 6 }}>
              <Text style={{ color: checked ? '#111827' : '#9ca3af', fontWeight: checked ? '600' : '400' }}>{checked ? '☑' : '☐'} {month}</Text>
            </Pressable>;
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Action title="Generate" disabled={planning.months.length === 0}
            onPress={() => { const months = grid.months.filter((month) => planning.months.includes(month)); onGenerateClub(row.clubId, months); }} />
          <Action title="Close" onPress={() => setPlanning(null)} />
        </View>
        {clubResult?.clubId === row.clubId && <View style={{ marginTop: 8 }}>
          <Text style={{ color: '#111827' }}>{clubResult.text}</Text>
          {clubResult.problems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: CLASH }}>{problem}</Text>)}
        </View>}
      </View>;
    }
    const expandedCell = expandedCellFor(row);
    return !onSelectSlot && expandedCell?.assignment ? <View style={{ marginLeft: SCHEDULE_CLUB_WIDTH }}>{renderDetail(expandedCell.assignment)}</View> : null;
  };

  if (!sharedLayout) {
    return <View onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      {grid.rows.map((row) => <View key={row.clubId} style={{ marginBottom: SCHEDULE_ROW_GAP }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {clubColumn(row)}
          <ScrollView horizontal showsHorizontalScrollIndicator style={wide ? { flex: 1, minWidth: 0 } : undefined}>
            <View style={{ flexDirection: 'row' }}>{cellsFor(row)}</View>
          </ScrollView>
        </View>
        {detail(row)}
      </View>)}
    </View>;
  }

  const rowHeight = scheduleRowHeight(cellWidth);
  const coverHeight = scheduleCoverHeight(cellWidth);
  const columnStep = cellWidth + gap;
  const contentWidth = grid.months.length * columnStep;
  const contentHeight = rows.length * (rowHeight + SCHEDULE_ROW_GAP);
  const stops: HighlightStop[] = [];
  if (highlighting) {
    for (let column = 0; column < grid.months.length; column++) {
      rows.forEach((row, rowIndex) => {
        const cell = row.cells[column];
        if (cell && isMatch(cell)) stops.push({ x: column * columnStep + cellWidth / 2, y: rowIndex * (rowHeight + SCHEDULE_ROW_GAP) + SCHEDULE_CELL_LABEL_HEIGHT + coverHeight / 2 });
      });
    }
  }
  return <View onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
    {highlighting && rows.length === 0 && <Text style={{ color: '#374151', marginBottom: 12 }}>No meetings use this title in the selected cycle.</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View>
        {rows.map((row) => <View key={row.clubId} style={{ height: rowHeight, marginBottom: SCHEDULE_ROW_GAP }}>{clubColumn(row)}</View>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator style={wide ? { flex: 1, minWidth: 0 } : undefined}>
        <View style={{ width: contentWidth, height: contentHeight }}>
          {rows.map((row) => <View key={row.clubId} style={{ flexDirection: 'row', height: rowHeight, marginBottom: SCHEDULE_ROW_GAP }}>{cellsFor(row)}</View>)}
          {stops.length > 0 && <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
            <HighlightPath key={highlightTitleId} stops={stops} width={contentWidth} height={contentHeight} reduceMotion={reduceMotion} />
          </View>}
        </View>
      </ScrollView>
    </View>
    {rows.map((row) => <React.Fragment key={row.clubId}>{detail(row)}</React.Fragment>)}
  </View>;
}

function GridCellView({ cell, title, cellWidth, expanded, showProblems, onToggle, onSelectSlot, onAddSlot, clubName }: {
  cell: GridCell;
  title: Title | undefined;
  cellWidth: number;
  expanded: boolean;
  showProblems: boolean;
  onToggle: (assignmentId: string) => void;
  onSelectSlot?: (slotId: string) => void;
  onAddSlot?: () => void;
  clubName: string;
}) {
  const cellStyle = { width: cellWidth };
  const coverHeight = scheduleCoverHeight(cellWidth);
  if (!cell.slot) {
    const body = <>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: coverHeight, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>{onAddSlot ? 'No meeting · tap to add' : '—'}</Text>
      </View>
    </>;
    return onAddSlot
      ? <Pressable style={cellStyle} accessibilityRole="button" accessibilityLabel={`${clubName}, ${cell.month}, no meeting. Add a meeting`} onPress={onAddSlot}>{body}</Pressable>
      : <View style={cellStyle} accessibilityLabel={`${cell.month}, no meeting in this month`}>{body}</View>;
  }
  if (!cell.assignment || !title) {
    const unavailable = !!cell.assignment;
    const content = <>
      <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>{cell.month}</Text>
      <View style={{ height: coverHeight, borderRadius: 6, borderWidth: expanded ? 2 : 1, borderStyle: 'dashed', borderColor: expanded ? '#2563eb' : '#9ca3af', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 12 }}>{unavailable ? 'Unavailable title' : onSelectSlot ? 'Not assigned · tap to choose a title' : 'Not assigned'}</Text>
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
