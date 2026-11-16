export type PickerOption = { id: string; label: string; detail: string; group: string };

// Matches every whitespace-separated term against the label and detail, and keeps only options in the chosen group.
export function filterOptions(options: PickerOption[], query: string, group: string): PickerOption[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => (group === 'all' || option.group === group) &&
    terms.every((term) => `${option.label} ${option.detail}`.toLowerCase().includes(term)));
}
