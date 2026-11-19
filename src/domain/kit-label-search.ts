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

export function titleLabelText(title: Title, labels: ReadonlyMap<string, KitLabel>): string {
  return title.labelIds.map((id) => labels.get(id)?.name ?? '').join(' ').toLowerCase();
}

export function titleLabelSummary(title: Title, labels: ReadonlyMap<string, KitLabel>): string {
  const selected = title.labelIds.map((id) => labels.get(id)).filter((label): label is KitLabel => !!label);
  const groups = (['genre', 'vibe'] as const).map((category) => {
    const names = selected.filter((label) => label.category === category)
      .map((label) => label.name).sort((a, b) => a.localeCompare(b));
    if (!names.length) return '';
    const more = names.length > 3 ? ` +${names.length - 3} more` : '';
    return `${category === 'genre' ? 'Genres' : 'Vibes'}: ${names.slice(0, 3).join(', ')}${more}`;
  }).filter(Boolean);
  return groups.length ? groups.join(' · ') : 'No title labels.';
}

export function catalogueMatches(title: Title, kits: Kit[], labels: ReadonlyMap<string, KitLabel>, query: string): { matches: boolean; matchingKitIds: Set<string> } {
  const search = query.trim().toLowerCase();
  const matchingKitIds = new Set(kits.filter((kit) => search &&
    [kit.barcode, ...kit.components].some((value) => value.toLowerCase().includes(search)))
    .map((kit) => kit.id));
  return { matches: !search || [title.name, title.author, title.isbn, titleLabelText(title, labels)].some((value) => value.toLowerCase().includes(search)) || matchingKitIds.size > 0, matchingKitIds };
}

export function preferenceMatches(title: Title, labels: ReadonlyMap<string, KitLabel>, query: string, selected: string[]): boolean {
  const search = query.trim().toLowerCase();
  if (!selected.every((id) => title.labelIds.includes(id))) return false;
  return !search || [title.name, title.author, title.isbn, titleLabelText(title, labels)].some((value) => value.toLowerCase().includes(search));
}
