import { csvCell } from './csv';
import { sortPriorityMatrix, type PriorityMatrix, type PrioritySort } from './cycle-overview';
import type { Cycle, Data } from './model';

export interface PreferencesExport {
  library: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  clubs: { id: string; name: string }[];
  titles: {
    id: string; name: string; author: string; isbn: string; coverUrl: string;
    cells: { clubId: string; rank: number | null }[];
  }[];
}

export function visiblePreferencesMatrix(matrix: PriorityMatrix, hiddenTitleIds: readonly string[], clubSort: PrioritySort | null, titleSort: PrioritySort | null): PriorityMatrix {
  const hidden = new Set(hiddenTitleIds);
  return sortPriorityMatrix({ ...matrix, rows: matrix.rows.filter((row) => !hidden.has(row.titleId)) }, clubSort, titleSort);
}

export function makePreferencesExport(data: Data, cycle: Cycle, matrix: PriorityMatrix): PreferencesExport {
  const clubs = new Map(data.clubs.map((club) => [club.id, club]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  return {
    library: data.library.name, cycleId: cycle.id, cycleName: cycle.name, cycleStatus: cycle.status,
    clubs: matrix.clubIds.map((id) => ({
      id, name: clubs.get(id)?.name ?? 'Unknown club',
    })),
    titles: matrix.rows.map((row) => {
      const title = titles.get(row.titleId);
      return {
        id: row.titleId, name: title?.name ?? 'Unavailable title', author: title?.author ?? '',
        isbn: title?.isbn ?? '', coverUrl: title?.coverUrl ?? '',
        cells: row.cells.map((cell) => ({ clubId: cell.clubId, rank: cell.rank })),
      };
    }),
  };
}

export function preferenceTitleLabel(title: Pick<PreferencesExport['titles'][number], 'name' | 'author'>): string {
  return title.author.trim() ? `${title.name} by ${title.author}` : title.name;
}

export function preferencesCsv(snapshot: PreferencesExport): string {
  const headers = ['Book title', ...snapshot.clubs.map((club) => club.name)];
  const lines = snapshot.titles.map((title) => {
    if (title.cells.length !== snapshot.clubs.length || title.cells.some((cell, index) => cell.clubId !== snapshot.clubs[index].id)) {
      throw new Error('Preference export columns are inconsistent.');
    }
    return [preferenceTitleLabel(title), ...title.cells.map((cell) => cell.rank)].map(csvCell).join(',');
  });
  return `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
