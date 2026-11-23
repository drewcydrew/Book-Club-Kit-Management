import { Pressable } from 'react-native';
import type { ClubListItem, ClubSortOrder } from '../domain/club-list';
import { ClubPicker } from './club-picker';
import { Action, Actions, Card, Label, Note } from './ui';

export function ClubFilterCard<T extends ClubListItem>({ title, clubs, selectedIds, onChange, open, onOpenChange, disabled = false, emptyMessage = 'No clubs exist yet.', order, onOrderChange }: {
  title: string; clubs: readonly T[]; selectedIds: readonly string[]; onChange: (ids: string[]) => void;
  open: boolean; onOpenChange: (open: boolean) => void; disabled?: boolean; emptyMessage?: string;
  order?: ClubSortOrder; onOrderChange?: (order: ClubSortOrder) => void;
}) {
  const selectedCount = clubs.filter((club) => selectedIds.includes(club.id)).length;
  return <Card>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}, ${selectedCount} of ${clubs.length}`} onPress={() => onOpenChange(!open)}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <Label>{open ? '▾' : '▸'} {title} · {selectedCount} of {clubs.length}</Label>
    </Pressable>
    {clubs.length === 0 ? <Note>{emptyMessage}</Note> : open && <>
      <Actions>
        <Action title="Show all" disabled={disabled || selectedCount === clubs.length} onPress={() => onChange(clubs.map((club) => club.id))} />
        <Action title="Hide all" disabled={disabled || selectedCount === 0} onPress={() => onChange([])} />
      </Actions>
      <ClubPicker
        clubs={clubs}
        disabled={disabled}
        order={order}
        onOrderChange={onOrderChange}
        isSelected={(club) => selectedIds.includes(club.id)}
        onPress={(club) => onChange(selectedIds.includes(club.id)
          ? selectedIds.filter((id) => id !== club.id)
          : [...selectedIds, club.id])}
      />
    </>}
  </Card>;
}
