export type RankedItem = {
  id: string; label: string; author: string; coverUrl: string | null; isbn: string;
  kitLabels: string; clubRead: boolean;
};

export type RankingListProps = {
  items: RankedItem[]; disabled: boolean;
  onReorder: (from: number, to: number) => void; onRemove: (titleId: string) => void;
  onShowDetails: (titleId: string) => void;
};
