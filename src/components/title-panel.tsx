import { Text, View } from 'react-native';
import type { Kit, Title } from '../domain/model';
import { PendingStatus, type PendingAction } from './pending-status';
import { TitleCover } from './title-cover';
import { Action, Actions, Card, Field, Label, Note } from './ui';

type TitlePanelProps = {
  titles: Title[];
  kits: Kit[];
  query: string;
  onQueryChange: (query: string) => void;
  staff: boolean;
  saving: boolean;
  pendingFor: (id: string) => PendingAction | null;
  onAdd: () => void;
  onEdit: (title: Title) => void;
  onDelete: (title: Title) => void;
};

export function TitlePanel({ titles, kits, query, onQueryChange, staff, saving, pendingFor, onAdd, onEdit, onDelete }: TitlePanelProps) {
  const search = query.trim().toLowerCase();
  const kitsFor = (titleId: string) => kits.filter((kit) => kit.titleId === titleId);
  const rows = titles.filter((title) => !search
    || `${title.name} ${title.author} ${title.isbn}`.toLowerCase().includes(search)
    || kitsFor(title.id).some((kit) => [kit.barcode, ...kit.components].some((barcode) => barcode.toLowerCase().includes(search))));

  return <View style={{ gap: 12 }}>
    <Label>Titles</Label>
    {staff && <Actions><Action tone="primary" title="Add title" onPress={onAdd} /></Actions>}
    <Field label="Search titles, authors, ISBN or kit barcode" value={query} onChangeText={onQueryChange} />
    <Note>{rows.length} of {titles.length} titles</Note>
    {rows.map((title) => {
      const kitCount = kitsFor(title.id).length;
      return <Card key={title.id}>
        <PendingStatus action={pendingFor(title.id)} />
        <View style={{ flexDirection: 'row' }}><TitleCover coverUrl={title.coverUrl} isbn={title.isbn} /><View style={{ flex: 1 }}>
          <Label>{title.name}</Label>
          <Note>{title.author} {title.isbn ? `· ISBN ${title.isbn}` : ''}</Note>
          <Note>{title.genres || 'No genres'} · {title.pages || 'Unknown'} pages · {title.largePrint ? 'Large print' : 'No large print'} · {title.audio ? 'Audio available' : 'No audio'}</Note>
          {title.notes ? <Text>Content notes: {title.notes}</Text> : null}
          <Note>{kitCount} {kitCount === 1 ? 'kit' : 'kits'}</Note>
        </View></View>
        {staff && <Actions><Action disabled={saving} title="Edit title" onPress={() => onEdit(title)} />
          <Action disabled={saving} tone="danger" title="Delete title" onPress={() => onDelete(title)} /></Actions>}
      </Card>;
    })}
  </View>;
}
