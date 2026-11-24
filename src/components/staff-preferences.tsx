import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Action, Actions, Card, Label, Note } from "./ui";
import { ClubFilterCard } from "./club-filter";
import { PriorityGridView } from "./priority-grid";
import { NativePriorityGridView } from "./priority-grid-native";
import { PreferencesExportActions } from "./preferences-export";
import { priorityMatrix, titleDemand, type PriorityMatrix, type PrioritySort } from "../domain/cycle-overview";
import { sortClubs, type ClubSortOrder } from "../domain/club-list";
import { visiblePreferencesMatrix } from "../domain/preferences-export";
import { preferences as clubPreferences } from "../domain/logic";
import type { Club, Cycle, Data } from "../domain/model";

export function useStaffPreferences({ data, cycle, availableClubs, enabled, order, onOrderChange }: {
  data: Data; cycle: Cycle | undefined; availableClubs: Club[]; enabled: boolean; order: ClubSortOrder; onOrderChange: (order: ClubSortOrder) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const [reviewClubIds, setReviewClubIds] = useState<string[] | null>(null);
  const sortedClubs = useMemo(() => sortClubs(availableClubs, order), [availableClubs, order]);
  const shownClubIds = useMemo(() => sortedClubs
    .filter((value) => reviewClubIds === null || reviewClubIds.includes(value.id))
    .map((value) => value.id), [sortedClubs, reviewClubIds]);
  const demand = useMemo(() => enabled ? titleDemand(data, cycle?.id ?? "", shownClubIds) : new Map<string, number>(), [data, cycle?.id, shownClubIds, enabled]);
  const matrix = useMemo(() => enabled && cycle ? priorityMatrix(data, cycle, shownClubIds, data.assignments) : null, [data, cycle, shownClubIds, enabled]);
  const clubsById = useMemo(() => enabled ? new Map(data.clubs.map((club) => [club.id, club])) : new Map<string, Club>(), [data.clubs, enabled]);
  const titlesById = useMemo(() => enabled ? new Map(data.titles.map((title) => [title.id, title])) : new Map<string, Data['titles'][number]>(), [data.titles, enabled]);
  const clubNameFor = useCallback((id: string) => clubsById.get(id)?.name ?? "Unknown club", [clubsById]);
  const titleFor = useCallback((id: string) => titlesById.get(id), [titlesById]);
  const hideClub = useCallback((id: string) => setReviewClubIds(shownClubIds.filter((clubId) => clubId !== id)), [shownClubIds]);
  return { data, cycle, availableClubs, filtersOpen, setFiltersOpen, summariesOpen, setSummariesOpen,
    demandOpen, setDemandOpen, expandedClubs, setExpandedClubs, setReviewClubIds, shownClubIds, demand,
    matrix, clubNameFor, titleFor, hideClub, sortedClubs, order, onOrderChange };
}

export function StaffPreferences({ controller, nativeHeader }: { controller: ReturnType<typeof useStaffPreferences>; nativeHeader?: ReactNode }) {
  const { data, cycle, filtersOpen, setFiltersOpen, summariesOpen, setSummariesOpen,
    demandOpen, setDemandOpen, expandedClubs, setExpandedClubs, setReviewClubIds, shownClubIds, demand,
    matrix, clubNameFor, titleFor, hideClub, sortedClubs, order, onOrderChange } = controller;
  if (!cycle) return null;
  const filters = <ClubFilterCard title="Clubs shown" clubs={sortedClubs} selectedIds={shownClubIds}
    onChange={setReviewClubIds} open={filtersOpen} onOpenChange={setFiltersOpen} order={order} onOrderChange={onOrderChange} />;
  const intro = <>
      <Label>Preferences · {cycle.name}</Label>
      <Note>
        Club rankings use the finalized order where available, otherwise
        the combined member rankings. Previously read titles are excluded. Contested counts include shown clubs that rank the title.
      </Note>
      {shownClubIds.length === 0 && <Note>Select clubs to see preferences.</Note>}
    </>;
  const footer = <>
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: summariesOpen }}
        onPress={() => setSummariesOpen(!summariesOpen)} style={styles.filterHeader}>
        <Label>{summariesOpen ? "▾" : "▸"} Club summaries · {shownClubIds.length} clubs</Label>
      </Pressable>
      {summariesOpen && (shownClubIds.length === 0 ? <Note>Select clubs to see preferences.</Note> : shownClubIds.map((id) => {
        const value = data.clubs.find((item) => item.id === id);
        const validOrder = clubPreferences(data, cycle, id);
        const expanded = expandedClubs.includes(id);
        return <Actions key={id}>
          <Text>
            {value?.name ?? "Unknown club"} · {Object.prototype.hasOwnProperty.call(cycle.finalized, id) ? "Finalized" : "Combined"}:{" "}
            {validOrder.length ? (expanded ? validOrder : validOrder.slice(0, 3)).map((titleId, index) =>
              `${index + 1}. ${data.titles.find((title) => title.id === titleId)?.name ?? "Unavailable title"}`).join(" · ") : "No ranked titles"}
          </Text>
          {validOrder.length > 3 && <Action title={expanded ? "Show fewer" : `Show all ${validOrder.length} ranks`} onPress={() =>
            setExpandedClubs(expanded ? expandedClubs.filter((clubId) => clubId !== id) : [...expandedClubs, id])} />}
        </Actions>;
      }))}
    </Card>
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: demandOpen }} onPress={() => setDemandOpen(!demandOpen)} style={styles.panelHeader}>
        <Label>{demandOpen ? "▾" : "▸"} Title demand · {shownClubIds.length} clubs</Label>
      </Pressable>
      {demandOpen && <>
      <Note>Interested clubs shown are counted once per title, regardless of finalization.</Note>
      {shownClubIds.length === 0 && <Note>Select clubs to see title demand.</Note>}
      {shownClubIds.length > 0 && demand.size === 0 && <Note>No selected titles for these clubs yet.</Note>}
      {data.titles.map((title) => {
        const interested = demand.get(title.id) ?? 0;
        if (!interested) return null;
        return (
          <Text key={title.id}>
            {title.name}: {interested} clubs ·{" "}
            {data.kits.filter((k) => k.titleId === title.id).length} kits
          </Text>
        );
      })}
      </>}
    </Card>
  </>;
  if (!matrix) return null;
  return <PreferencesGridWorkspace key={cycle.id} data={data} cycle={cycle} matrix={matrix} clubNameFor={clubNameFor}
    titleFor={titleFor} onHideClub={hideClub} nativeHeader={nativeHeader} filters={filters} intro={intro} footer={footer} />;
}

function PreferencesGridWorkspace({ data, cycle, matrix, clubNameFor, titleFor, onHideClub, nativeHeader, filters, intro, footer }: {
  data: Data; cycle: Cycle; matrix: PriorityMatrix; clubNameFor: (id: string) => string;
  titleFor: (id: string) => Data['titles'][number] | undefined; onHideClub: (id: string) => void;
  nativeHeader?: ReactNode; filters: ReactNode; intro: ReactNode; footer: ReactNode;
}) {
  const [hiddenTitleIds, setHiddenTitleIds] = useState<string[]>([]);
  const [sortClub, setSortClub] = useState<PrioritySort | null>(null);
  const [sortTitle, setSortTitle] = useState<PrioritySort | null>(null);
  const [selectedClubId, setSelectedClubId] = useState(matrix.clubIds[0] ?? '');
  const [titleDirection, setTitleDirection] = useState<PrioritySort['direction']>('ascending');
  const [clubDirection, setClubDirection] = useState<PrioritySort['direction']>('ascending');
  const [expandedTitleId, setExpandedTitleId] = useState<string | null>(null);
  const selectedClub = matrix.clubIds.includes(selectedClubId) ? selectedClubId : matrix.clubIds[0] ?? '';
  if (selectedClub !== selectedClubId) setSelectedClubId(selectedClub);
  const activeClub = sortClub && matrix.clubIds.includes(sortClub.id) ? sortClub : null;
  const activeTitle = sortTitle && matrix.rows.some((row) => row.titleId === sortTitle.id && !hiddenTitleIds.includes(row.titleId)) ? sortTitle : null;
  if (sortClub && !activeClub) setSortClub(null);
  if (sortTitle && !activeTitle) setSortTitle(null);
  const visibleMatrix = useMemo(() => {
    const native = nativeHeader !== undefined;
    const nativeTitle = expandedTitleId && !hiddenTitleIds.includes(expandedTitleId) && matrix.rows.some((row) => row.titleId === expandedTitleId)
      ? { id: expandedTitleId, direction: clubDirection } : null;
    return visiblePreferencesMatrix(matrix, hiddenTitleIds,
      native ? (selectedClub ? { id: selectedClub, direction: titleDirection } : null) : activeClub,
      native ? nativeTitle : activeTitle);
  }, [matrix, hiddenTitleIds, nativeHeader, expandedTitleId, clubDirection, selectedClub, titleDirection, activeClub, activeTitle]);
  const exportControls = <PreferencesExportActions data={data} cycle={cycle} matrix={visibleMatrix} />;
  if (nativeHeader !== undefined) {
    return <NativePriorityGridView matrix={matrix} clubNameFor={clubNameFor} titleFor={titleFor} onHideClub={onHideClub}
      hiddenTitleIds={hiddenTitleIds} setHiddenTitleIds={setHiddenTitleIds}
      selectedClubId={selectedClub} setSelectedClubId={setSelectedClubId} titleDirection={titleDirection} setTitleDirection={setTitleDirection}
      clubDirection={clubDirection} setClubDirection={setClubDirection} expandedTitleId={expandedTitleId} setExpandedTitleId={setExpandedTitleId}
      header={<>{nativeHeader}{filters}<Card>{intro}{exportControls}</Card></>} footer={footer} />;
  }
  return <>{filters}<Card>{intro}{exportControls}<PriorityGridView matrix={matrix} clubNameFor={clubNameFor} titleFor={titleFor}
    onHideClub={onHideClub} hiddenTitleIds={hiddenTitleIds} setHiddenTitleIds={setHiddenTitleIds}
    sortClub={activeClub} setSortClub={setSortClub} sortTitle={activeTitle} setSortTitle={setSortTitle} /></Card>{footer}</>;
}

const styles = StyleSheet.create({
  panelHeader: { gap: 4 },
  filterHeader: { minHeight: 44, justifyContent: "center" },
});
