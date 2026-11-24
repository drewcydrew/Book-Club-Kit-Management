import { useState } from 'react';
import { MemberSchedulePage } from '../components/member-schedule-page';
import { StaffSchedule } from '../components/staff-schedule';
import { useScheduleWorkspace } from '../components/schedule-workspace';
import { ScreenGate } from '../components/screen-gate';
import { useStore } from '../state/store';

export default function Schedule() {
  return <ScreenGate><ScheduleContent /></ScreenGate>;
}

// The editor and selected cycle live here so unsaved staff edits survive switching to a member user.
function ScheduleContent() {
  const { data } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const selectedCycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const editor = useScheduleWorkspace(data, selectedCycle);
  const staff = person?.role === 'staff' || person?.role === 'admin';

  return staff
    ? <StaffSchedule editor={editor} selectedCycle={selectedCycle} onSelectCycle={setSelectedId} />
    : <MemberSchedulePage editor={editor} cycle={selectedCycle} />;
}
