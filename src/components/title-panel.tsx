import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { catalogueMatches, indexKits, titleLabelSummary } from '../domain/kit-label-search';
import type { Kit, KitLabel, Title } from '../domain/model';
import { KitPanel } from './kit-panel';
import { PendingStatus, type PendingAction } from './pending-status';
import { TitleCover } from './title-cover';
import { Action, Actions, Card, Field, Label, Note } from './ui';

type TitlePanelProps = {
  titles: Title[]; kits: Kit[]; labels: KitLabel[]; query: string; onQueryChange: (query: string) => void;
  staff: boolean; saving: boolean; pendingTitleFor: (id: string) => PendingAction | null; pendingKitFor: (id: string) => PendingAction | null;
  onAddTitle: () => void; onAddKit: (titleId?: string) => void; onEdit: (title: Title) => void; onDelete: (title: Title) => void;
  onEditKit: (kit: Kit) => void; onDeleteKit: (kit: Kit) => void;
};

export function TitlePanel({ titles, kits, labels, query, onQueryChange, staff, saving, pendingTitleFor, pendingKitFor,
  onAddTitle, onAddKit, onEdit, onDelete, onEditKit, onDeleteKit }: TitlePanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const kitsByTitle = useMemo(() => indexKits(kits), [kits]);
  const labelById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const rows = titles.map((title) => {
    const related = kitsByTitle.get(title.id) ?? [];
    return { title, related, ...catalogueMatches(title, related, labelById, query) };
  }).filter((row) => row.matches);

  return <View style={{ gap: 12 }}>
    <Label>Titles and kits</Label>
    {staff && <Actions><Action tone="primary" title="Add title" onPress={onAddTitle} /><Action title="Add kit" onPress={() => onAddKit()} /></Actions>}
    <Field label="Search titles, authors, ISBN, barcodes or title labels" value={query} onChangeText={(value) => { setExpanded({}); onQueryChange(value); }} />
    <Note>{rows.length} of {titles.length} titles</Note>
    {rows.length === 0 && <Note>{query.trim() ? 'No matching titles or kits.' : 'No titles yet.'}</Note>}
    {rows.map(({ title, related, matchingKitIds }) => {
      const isExpanded = expanded[title.id] ?? matchingKitIds.size > 0;
      return <Card key={title.id}>
        <PendingStatus action={pendingTitleFor(title.id)} />
        <View style={{ flexDirection: 'row' }}><TitleCover coverUrl={title.coverUrl} isbn={title.isbn} /><View style={{ flex: 1 }}>
          <Label>{title.name}</Label>
          <Note>{title.author} {title.isbn ? `· ISBN ${title.isbn}` : ''}</Note>
          <Note>Source genres: {title.genres || 'None'} · {title.pages || 'Unknown'} pages · {title.largePrint ? 'Large print' : 'No large print'} · {title.audio ? 'Audio available' : 'No audio'}</Note>
          <Note>{titleLabelSummary(title, labelById)}</Note>
          {title.publisher || title.datePublished ? <Note>{[title.publisher, title.datePublished].filter(Boolean).join(' · ')}</Note> : null}
          {title.synopsis ? <Text>{title.synopsis}</Text> : <Note>No description stored.</Note>}
          {title.notes ? <Text>Content notes: {title.notes}</Text> : null}
        </View></View>
        <Actions><Action title={`${isExpanded ? 'Hide' : 'Show'} kits for ${title.name} (${related.length})`}
          onPress={() => setExpanded({ ...expanded, [title.id]: !isExpanded })} />
          {staff && <Action title={`Add kit for ${title.name}`} onPress={() => onAddKit(title.id)} />}</Actions>
        {isExpanded && <KitPanel kits={related} matchingKitIds={matchingKitIds} staff={staff} saving={saving}
          pendingFor={pendingKitFor} onEdit={onEditKit} onDelete={onDeleteKit} />}
        {staff && <Actions><Action disabled={saving} title="Edit title" onPress={() => onEdit(title)} />
          <Action disabled={saving} tone="danger" title="Delete title" onPress={() => onDelete(title)} /></Actions>}
      </Card>;
    })}
  </View>;
}
