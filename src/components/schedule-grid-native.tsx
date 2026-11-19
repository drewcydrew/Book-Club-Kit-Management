import React, { type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { GridCell, GridRow } from '../domain/cycle-overview';
import type { Assignment, Title } from '../domain/model';
import { SearchPicker } from './search-picker';
import { TitleCover } from './title-cover';
import { Action, Actions, Card, Label, Note } from './ui';

type Props = {
  header: ReactNode;
  row?: GridRow;
  clubIds: string[];
  focusedId: string;
  onFocus: (id: string) => void;
  clubNameFor: (id: string) => string;
  titleFor: (assignment: Assignment) => Title | undefined;
  priorityFor: (titleId: string) => number | null;
  summary: string;
  highlightTitleId: string | null;
  selectedSlotId: string | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
  renderDetail: (assignment: Assignment) => ReactNode;
  onSelectSlot?: (id: string) => void;
  onAddSlot?: (clubId: string, month: string) => void;
  onGenerateClub?: (clubId: string) => void;
  onHideClub: (clubId: string) => void;
  actionsDisabled: boolean;
  clubResult: { clubId: string; text: string; problems: string[] } | null;
  hasShownClubs: boolean;
};

export function NativeScheduleGridView({ header, row, clubIds, focusedId, onFocus, clubNameFor, titleFor, priorityFor,
  summary, highlightTitleId, selectedSlotId, expandedId, onToggle, renderDetail, onSelectSlot, onAddSlot,
  onGenerateClub, onHideClub, actionsDisabled, clubResult, hasShownClubs }: Props) {
  const clubName = focusedId ? clubNameFor(focusedId) : '';
  const options = clubIds.map((id) => ({ id, label: clubNameFor(id), detail: '', group: 'all' }));

  function renderMonth({ item: cell }: { item: GridCell }) {
    const assignment = cell.assignment;
    const title = assignment ? titleFor(assignment) : undefined;
    const matching = !!highlightTitleId && title?.id === highlightTitleId;
    const selected = onSelectSlot ? cell.slot?.id === selectedSlotId : !!assignment && assignment.id === expandedId;
    const status = !cell.slot ? 'No meeting' : !assignment ? 'Not assigned' : !title ? 'Unavailable title' : title.name;
    const priority = title ? priorityFor(title.id) : null;
    const review = !!cell.problem && !!assignment;
    const label = `${clubName}, ${cell.month}, ${status}${title ? priority === null ? ', unranked' : `, priority ${priority}` : ''}${review ? ', needs review' : ''}${matching ? ', highlighted' : ''}`;
    const onPress = cell.slot && onSelectSlot ? () => onSelectSlot(cell.slot!.id)
      : assignment ? () => onToggle(assignment.id)
      : !cell.slot && onAddSlot ? () => onAddSlot(focusedId, cell.month) : undefined;
    const content = <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: highlightTitleId && !matching ? 0.4 : 1 }}>
      {title && (title.coverUrl || title.isbn.trim())
        ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 56, height: 84, marginRight: 0, marginBottom: 0 }} />
        : <View style={{ width: 56, height: 84, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
          <Text style={{ color: '#6b7280', fontSize: 10, textAlign: 'center' }}>{title ? 'No cover' : status}</Text>
        </View>}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: '#465c56', fontWeight: '600' }}>{cell.month}{assignment?.meeting || cell.slot?.meeting ? ` · ${assignment?.meeting ?? cell.slot?.meeting}` : ''}</Text>
        <Text style={{ color: '#183a36', fontWeight: '700' }}>{status}</Text>
        {title && <Text>{priority === null ? 'Unranked' : `Priority #${priority}`}{matching ? ' · Highlighted' : ''}</Text>}
        {review && <Text style={{ color: '#a22525' }}>Needs review</Text>}
        {!cell.slot && onAddSlot && <Text>Tap to add a meeting</Text>}
        {cell.slot && !assignment && onSelectSlot && <Text>Tap to choose a title</Text>}
      </View>
    </View>;
    return <View style={{ marginBottom: 8, padding: 10, backgroundColor: '#fffefa', borderWidth: matching || selected ? 2 : 1, borderColor: matching ? '#245e51' : selected ? '#2563eb' : '#cbd8d2' }}>
      {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={onSelectSlot ? { selected } : assignment ? { expanded: selected } : undefined}
        onPress={onPress}>{content}</Pressable> : <View accessibilityLabel={label}>{content}</View>}
      {!onSelectSlot && selected && assignment && renderDetail(assignment)}
    </View>;
  }

  return <FlatList style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}
    data={row?.cells ?? []} renderItem={renderMonth} keyExtractor={(cell) => cell.month}
    initialNumToRender={5} maxToRenderPerBatch={5} windowSize={5}
    ListHeaderComponent={<View style={{ gap: 18 }}>
      {header}
      {focusedId && <Card>
        <Label>Reviewing {clubName}</Label>
        <Note>Choose a club to review its months. Clubs shown still controls generation and exports.</Note>
        <SearchPicker label="Review club" options={options} selectedId={focusedId}
          groups={[{ value: 'all', label: 'All' }]} disabled={actionsDisabled} onSelect={onFocus} />
        <Text>{summary}</Text>
        <Actions>
          <Action title="Hide club" accessibilityLabel={`Hide ${clubName}`} disabled={actionsDisabled} onPress={() => onHideClub(focusedId)} />
          {onGenerateClub && <Action title="Generate assignments" accessibilityLabel={`Generate assignments for ${clubName}`}
            disabled={actionsDisabled} onPress={() => onGenerateClub(focusedId)} />}
        </Actions>
        {clubResult?.clubId === focusedId && <View>
          <Text>{clubResult.text}</Text>
          {clubResult.problems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: '#a22525' }}>{problem}</Text>)}
        </View>}
      </Card>}
      {!focusedId && <Note>{highlightTitleId && hasShownClubs
        ? 'No meetings use this title in the selected cycle.'
        : 'Select at least one club to show the schedule.'}</Note>}
    </View>}
  />;
}
