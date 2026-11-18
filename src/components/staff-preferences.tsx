import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Action, Actions, Card, Label, Note } from "./ui";
import { PriorityGridView } from "./priority-grid";
import { priorityMatrix, titleDemand } from "../domain/cycle-overview";
import { preferences as clubPreferences } from "../domain/logic";
import type { Club, Cycle, Data } from "../domain/model";

export function useStaffPreferences({ data, cycle, availableClubs }: {
  data: Data; cycle: Cycle | undefined; availableClubs: Club[];
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const [reviewClubIds, setReviewClubIds] = useState<string[] | null>(null);
  const shownClubIds = availableClubs
    .filter((value) => reviewClubIds === null || reviewClubIds.includes(value.id))
    .map((value) => value.id);
  const demand = titleDemand(data, cycle?.id ?? "", shownClubIds);
  return { data, cycle, availableClubs, filtersOpen, setFiltersOpen, summariesOpen, setSummariesOpen,
    demandOpen, setDemandOpen, expandedClubs, setExpandedClubs, setReviewClubIds, shownClubIds, demand };
}

export function StaffPreferences({ controller }: { controller: ReturnType<typeof useStaffPreferences> }) {
  const { data, cycle, availableClubs, filtersOpen, setFiltersOpen, summariesOpen, setSummariesOpen,
    demandOpen, setDemandOpen, expandedClubs, setExpandedClubs, setReviewClubIds, shownClubIds, demand } = controller;
  if (!cycle) return null;
  return <>
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }}
        accessibilityLabel={`Clubs shown, ${shownClubIds.length} of ${availableClubs.length}`}
        onPress={() => setFiltersOpen(!filtersOpen)} style={styles.filterHeader}>
        <Label>{filtersOpen ? "▾" : "▸"} Clubs shown · {shownClubIds.length} of {data.clubs.length}</Label>
      </Pressable>
      {data.clubs.length === 0 ? (
        <Note>No clubs exist yet.</Note>
      ) : filtersOpen ? (
        <>
          <Actions>
            <Action title="Show all" disabled={shownClubIds.length === data.clubs.length}
              onPress={() => setReviewClubIds(data.clubs.map((value) => value.id))} />
            <Action title="Hide all" disabled={shownClubIds.length === 0}
              onPress={() => setReviewClubIds([])} />
          </Actions>
          <Actions>
            {data.clubs.map((value) => (
              <Action
                key={value.id}
                selected={shownClubIds.includes(value.id)}
                title={value.name}
                onPress={() =>
                  setReviewClubIds(
                    shownClubIds.includes(value.id)
                      ? shownClubIds.filter((id) => id !== value.id)
                      : [...shownClubIds, value.id],
                  )
                }
              />
            ))}
          </Actions>
        </>
      ) : null}
    </Card>
    <Card>
      <Label>Preferences · {cycle.name}</Label>
      <Note>
        Club rankings use the finalized order where available, otherwise
        the combined member rankings. Previously read titles are excluded. Contested counts include shown clubs that rank the title.
      </Note>
      {shownClubIds.length === 0 && <Note>Select clubs to see preferences.</Note>}
      <PriorityGridView key={cycle.id}
        matrix={priorityMatrix(data, cycle, shownClubIds, data.assignments)}
        clubNameFor={(id) => data.clubs.find((value) => value.id === id)?.name ?? "Unknown club"}
        titleFor={(id) => data.titles.find((value) => value.id === id)}
        onHideClub={(id) => setReviewClubIds(shownClubIds.filter((clubId) => clubId !== id))}
      />
    </Card>
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
}

const styles = StyleSheet.create({
  panelHeader: { gap: 4 },
  filterHeader: { minHeight: 44, justifyContent: "center" },
});
