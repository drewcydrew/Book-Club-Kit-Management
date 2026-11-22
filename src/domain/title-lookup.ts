import type { IsbnLookup } from '../state/api';
import type { Title } from './model';

// Replaces every lookup-derived field with the ISBN result. A null result (not found) clears them.
// Name and author keep their current value when ISBNdb has none, because a blank name blocks saving.
export function replaceWithLookup(
  title: Title,
  pages: string,
  found: IsbnLookup | null,
): { value: Title; pages: string } {
  return {
    pages: found?.pages == null ? '' : String(found.pages),
    value: {
      ...title,
      name: found?.title ?? title.name,
      author: found?.author ?? title.author,
      genres: found?.genres ?? '',
      coverUrl: found?.coverUrl ?? null,
      publisher: found?.publisher ?? null,
      synopsis: found?.synopsis ?? null,
      datePublished: found?.datePublished ?? null,
      binding: found?.binding ?? null,
      language: found?.language ?? null,
    },
  };
}
