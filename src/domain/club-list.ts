export type ClubSortOrder = 'az' | 'za';

export type ClubListItem = { id: string; name: string; branch: string };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function compareClubs(a: ClubListItem, b: ClubListItem): number {
  return collator.compare(a.name, b.name) || collator.compare(a.branch, b.branch) || collator.compare(a.id, b.id);
}

export function sortClubs<T extends ClubListItem>(clubs: readonly T[], order: ClubSortOrder): T[] {
  const sorted = [...clubs].sort(compareClubs);
  return order === 'za' ? sorted.reverse() : sorted;
}

// Every whitespace-separated term must appear in the name or branch, so "book central" matches "Book Club · Central".
export function filterClubs<T extends ClubListItem>(clubs: readonly T[], query: string): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...clubs];
  return clubs.filter((club) => {
    const text = `${club.name} ${club.branch}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
