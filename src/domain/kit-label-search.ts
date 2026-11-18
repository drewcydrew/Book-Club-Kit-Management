import type { Kit, KitLabel, Title } from './model';

export function indexKits(kits: Kit[]): Map<string, Kit[]> {
  const grouped = new Map<string, Kit[]>();
  for (const kit of kits) {
    const group = grouped.get(kit.titleId) ?? [];
    group.push(kit);
    grouped.set(kit.titleId, group);
  }
  return grouped;
}

export function kitLabelText(kit: Kit, labels: ReadonlyMap<string, KitLabel>): string {
  return kit.labelIds.map((id) => labels.get(id)?.name ?? '').join(' ').toLowerCase();
}

export function kitLabelSummary(kits: Kit[], labels: ReadonlyMap<string, KitLabel>): string {
  if (!kits.length) return 'No physical kits yet.';
  const selected = new Map<string, KitLabel>();
  for (const kit of kits) for (const id of kit.labelIds) {
    const label = labels.get(id);
    if (label) selected.set(id, label);
  }
  const groups = (['genre', 'vibe'] as const).map((category) => {
    const names = [...selected.values()].filter((label) => label.category === category)
      .map((label) => label.name).sort((a, b) => a.localeCompare(b));
    if (!names.length) return '';
    const more = names.length > 3 ? ` +${names.length - 3} more` : '';
    return `${category === 'genre' ? 'Genres' : 'Vibes'}: ${names.slice(0, 3).join(', ')}${more}`;
  }).filter(Boolean);
  return groups.length ? `Kit labels (may vary): ${groups.join(' · ')}` : 'No kit labels.';
}

export function catalogueMatches(title: Title, kits: Kit[], labels: ReadonlyMap<string, KitLabel>, query: string): { matches: boolean; matchingKitIds: Set<string> } {
  const search = query.trim().toLowerCase();
  const matchingKitIds = new Set(kits.filter((kit) => search &&
    [kit.barcode, ...kit.components, kitLabelText(kit, labels)].some((value) => value.toLowerCase().includes(search)))
    .map((kit) => kit.id));
  return { matches: !search || [title.name, title.author, title.isbn].some((value) => value.toLowerCase().includes(search)) || matchingKitIds.size > 0, matchingKitIds };
}

export function preferenceMatches(title: Title, kits: Kit[], labels: ReadonlyMap<string, KitLabel>, query: string, selected: string[]): boolean {
  const search = query.trim().toLowerCase();
  const matchingKits = kits.filter((kit) => selected.every((id) => kit.labelIds.includes(id)));
  if (selected.length > 0 && matchingKits.length === 0) return false;
  return !search || [title.name, title.author, title.isbn].some((value) => value.toLowerCase().includes(search)) ||
    matchingKits.some((kit) => kitLabelText(kit, labels).includes(search));
}
