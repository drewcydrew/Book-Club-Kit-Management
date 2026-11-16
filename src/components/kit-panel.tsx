import { View } from 'react-native';
import type { Kit, Title } from '../domain/model';
import { PendingStatus, type PendingAction } from './pending-status';
import { TitleCover } from './title-cover';
import { Action, Actions, Card, Field, Label, Note } from './ui';

type KitPanelProps = {
  kits: Kit[];
  titles: Title[];
  query: string;
  onQueryChange: (query: string) => void;
  staff: boolean;
  saving: boolean;
  pendingFor: (id: string) => PendingAction | null;
  onAdd: () => void;
  onEdit: (kit: Kit) => void;
  onDelete: (kit: Kit) => void;
};

const kitCoverStyle = { width: 40, height: 60, marginRight: 0 };

export function KitPanel({ kits, titles, query, onQueryChange, staff, saving, pendingFor, onAdd, onEdit, onDelete }: KitPanelProps) {
  const search = query.trim().toLowerCase();
  const titleById = new Map(titles.map((title) => [title.id, title]));
  const rows = kits
    .map((kit) => ({ kit, title: titleById.get(kit.titleId) }))
    .filter(({ kit, title }) => !search || [title?.name, title?.author, title?.isbn, kit.barcode, ...kit.components]
      .some((text) => text?.toLowerCase().includes(search)))
    .sort((a, b) => (a.title?.name ?? '').localeCompare(b.title?.name ?? '') || a.kit.barcode.localeCompare(b.kit.barcode));

  return <View style={{ gap: 12 }}>
    <Label>Kits</Label>
    {staff && <Actions><Action tone="primary" title="Add kit" onPress={onAdd} /></Actions>}
    <Field label="Search kits by title, author, ISBN or barcode" value={query} onChangeText={onQueryChange} />
    <Note>{rows.length} of {kits.length} kits</Note>
    {rows.map(({ kit, title }) => <Card key={kit.id}>
      <PendingStatus action={pendingFor(kit.id)} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {title && (title.coverUrl || title.isbn)
          ? <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={kitCoverStyle} />
          : <View style={kitCoverStyle} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Label>{kit.barcode}</Label>
          <Note>{title?.name ?? 'Unknown title'} · {kit.branch} · {kit.copies} copies · {kit.status}{kit.extras ? ` · ${kit.extras}` : ''}</Note>
          {kit.components.length > 0 && <Note>Copies: {kit.components.join(', ')}</Note>}
        </View>
      </View>
      {staff && <Actions><Action disabled={saving} title={`Edit ${kit.barcode}`} onPress={() => onEdit(kit)} />
        <Action disabled={saving} tone="danger" title={`Delete ${kit.barcode}`} onPress={() => onDelete(kit)} /></Actions>}
    </Card>)}
  </View>;
}
