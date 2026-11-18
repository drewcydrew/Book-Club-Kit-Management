import type { Title } from '../domain/model';

export function titleDetailRows(title: Title): [string, string][] {
  const flag = (value: boolean) => (value ? 'Yes' : 'No');
  const entries: [string, string | number | null | undefined][] = [
    ['Author', title.author],
    ['ISBN', title.isbn],
    ['Pages', title.pages || null],
    ['Publisher', title.publisher],
    ['Date published', title.datePublished],
    ['Binding', title.binding],
    ['Language', title.language],
    ['Source genres', title.genres],
    ['Large print', flag(title.largePrint)],
    ['Audio', flag(title.audio)],
  ];
  return entries
    .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined && entry[1] !== '')
    .map(([label, value]) => [label, String(value)]);
}
