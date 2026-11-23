import React, { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { clubYearPreview, type PreviewMark, type PreviewMonth } from "../domain/club-preview";
import type { Club } from "../domain/model";
import { Action, Label, Note, narrowWidth } from "./ui";

const markColours: Record<PreviewMark, string> = { meeting: "#245e51", pickup: "#2f6fa3", return: "#a35d2f" };
// When several marks share a day, the meeting colour wins so the most important date stays visible.
const markPriority: PreviewMark[] = ["meeting", "pickup", "return"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function YearPreview({ club }: { club: Club }) {
  const { width } = useWindowDimensions();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const months = clubYearPreview(club, year);
  const perRow = width < narrowWidth ? 2 : 4;

  return (
    <View style={styles.wrap}>
      <Label>Year preview</Label>
      <View style={styles.yearRow}>
        <Action title="‹ Prev" onPress={() => setYear(year - 1)} />
        <Text style={styles.yearText}>{year}</Text>
        <Action title="Next ›" onPress={() => setYear(year + 1)} />
      </View>
      <View style={styles.grid}>
        {months.map((month, index) => (
          <MonthCard key={month.month} month={month} label={monthNames[index]} width={`${100 / perRow - 2}%`} />
        ))}
      </View>
      <View style={styles.legend}>
        {markPriority.map((mark) => (
          <View key={mark} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: markColours[mark] }]} />
            <Text style={styles.legendText}>{mark}</Text>
          </View>
        ))}
        <Text style={styles.legendText}>Grey month = skipped</Text>
      </View>
      <Note>Indicative only: shows what the current rules produce for {year}, Monday-first weeks. Dated assignments are not moved by these edits.</Note>
    </View>
  );
}

function MonthCard({ month, label, width }: { month: PreviewMonth; label: string; width: string }) {
  const [year, monthNumber] = month.month.split("-").map(Number);
  const leadingBlanks = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];

  return (
    <View style={[styles.month, { width }, month.skipped && styles.monthSkipped]}>
      <Text style={[styles.monthTitle, month.skipped && styles.skippedText]}>
        {label}{month.skipped ? " · skipped" : ""}
      </Text>
      <View style={styles.days}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={styles.cell} />;
          const date = `${month.month}-${String(day).padStart(2, "0")}`;
          const marks = month.marks[date] ?? [];
          const mark = markPriority.find((item) => marks.includes(item));
          return (
            <View key={date} style={[styles.cell, mark !== undefined && { backgroundColor: markColours[mark] }]}>
              <Text style={[styles.cellText, mark !== undefined && styles.markText]}>{day}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  yearText: { fontWeight: "600", color: "#183a36" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  month: { borderWidth: 1, borderColor: "#e1e8e3", borderRadius: 8, padding: 6, backgroundColor: "#fffefa", gap: 4 },
  monthSkipped: { backgroundColor: "#eeeeee", borderColor: "#cfcfcf" },
  monthTitle: { fontSize: 12, fontWeight: "600", color: "#183a36" },
  skippedText: { color: "#888" },
  days: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 3 },
  cellText: { fontSize: 8, color: "#465c56" },
  markText: { color: "#fff", fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 12, color: "#465c56", textTransform: "capitalize" },
});
