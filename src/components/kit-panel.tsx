import { View } from 'react-native';
import type { Kit, KitLabel } from '../domain/model';
import { PendingStatus, type PendingAction } from './pending-status';
import { Action, Actions, Card, Label, Note } from './ui';

export function KitPanel({ kits, labels, matchingKitIds, staff, saving, pendingFor, onEdit, onDelete }: {
  kits: Kit[]; labels: ReadonlyMap<string, KitLabel>; matchingKitIds: ReadonlySet<string>; staff: boolean; saving: boolean;
  pendingFor: (id: string) => PendingAction | null; onEdit: (kit: Kit) => void; onDelete: (kit: Kit) => void;
}) {
  if (!kits.length) return <Note>No kits for this title.</Note>;
  return <View style={{ gap: 8 }}>
    {[...kits].sort((a, b) => a.barcode.localeCompare(b.barcode)).map((kit) => <Card key={kit.id}>
      <PendingStatus action={pendingFor(kit.id)} />
      <Label>{kit.barcode}{matchingKitIds.has(kit.id) ? ' · Search match' : ''}</Label>
      <Note>{kit.branch} · {kit.copies} copies · {kit.status}{kit.extras ? ` · ${kit.extras}` : ''}</Note>
      {kit.components.length > 0 && <Note>Copies: {kit.components.join(', ')}</Note>}
      {(['genre', 'vibe'] as const).map((category) => {
        const names = kit.labelIds.map((id) => labels.get(id)).filter((label): label is KitLabel => !!label && label.category === category).map((label) => label.name);
        return <Note key={category}>{category === 'genre' ? 'Kit genres' : 'Kit vibes'}: {names.join(', ') || 'None'}</Note>;
      })}
      {staff && <Actions><Action disabled={saving} title={`Edit ${kit.barcode}`} onPress={() => onEdit(kit)} />
        <Action disabled={saving} tone="danger" title={`Delete ${kit.barcode}`} onPress={() => onDelete(kit)} /></Actions>}
    </Card>)}
  </View>;
}
