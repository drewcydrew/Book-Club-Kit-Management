import { addDays, today } from './dates';
import type { Data } from './model';

export function seed(): Data {
  const now = today();
  const titles = [
    { id: 't1', name: 'The Lantern Garden', author: 'Mara Fields', isbn: '9780000000001', pages: 312, genres: 'Fiction', notes: '', largePrint: true, audio: true },
    { id: 't2', name: 'A Map of Small Things', author: 'Ari Vale', isbn: '9780000000002', pages: 260, genres: 'Mystery', notes: '', largePrint: false, audio: true },
    { id: 't3', name: 'River of Seasons', author: 'Sam Rowan', isbn: '9780000000003', pages: 288, genres: 'Nature, Fiction', notes: '', largePrint: true, audio: false },
    { id: 't4', name: 'The Clockmaker’s Table', author: 'Jo Ellis', isbn: '9780000000004', pages: 341, genres: 'Historical', notes: '', largePrint: false, audio: false },
  ];
  return {
    version: 1,
    library: { name: 'Harbour Library', branches: ['Central', 'West'], loanDays: 28, bufferDays: 3 },
    people: [
      { id: 'p1', name: 'Alex (library admin)', role: 'admin' },
      { id: 'p2', name: 'Morgan (staff)', role: 'staff' },
      { id: 'p3', name: 'Casey (leader)', role: 'leader', clubId: 'c1' },
      { id: 'p4', name: 'Robin (member)', role: 'member', clubId: 'c1' },
      { id: 'p5', name: 'Taylor (leader)', role: 'leader', clubId: 'c2' },
      { id: 'p6', name: 'Jordan (member)', role: 'member', clubId: 'c2' },
    ],
    titles,
    kits: [
      { id: 'k1', titleId: 't1', barcode: 'KIT-101', branch: 'Central', copies: 10, extras: 'Discussion guide', components: [], status: 'available' },
      { id: 'k2', titleId: 't1', barcode: 'KIT-102', branch: 'West', copies: 10, extras: 'Tote', components: [], status: 'available' },
      { id: 'k3', titleId: 't2', barcode: 'KIT-103', branch: 'Central', copies: 8, extras: '', components: [], status: 'available' },
      { id: 'k4', titleId: 't3', barcode: 'KIT-104', branch: 'West', copies: 12, extras: '', components: [], status: 'available' },
      { id: 'k5', titleId: 't4', barcode: 'KIT-105', branch: 'Central', copies: 10, extras: '', components: [], status: 'available' },
    ],
    clubs: [
      { id: 'c1', name: 'Harbour Readers', branch: 'Central', leaderId: 'p3', size: 8, cadence: 'Monthly', pickup: 'pickup', address: '', history: ['t4'] },
      { id: 'c2', name: 'Westside Stories', branch: 'West', leaderId: 'p5', size: 10, cadence: 'Monthly', pickup: 'delivery', address: 'Fictional West Community Centre', history: [] },
    ],
    cycles: [{
      id: 'cycle1', name: 'Upcoming reading cycle', deadline: addDays(now, 14), status: 'collecting', finalized: {},
      slots: [
        { id: 's1', clubId: 'c1', meeting: addDays(now, 35) },
        { id: 's2', clubId: 'c2', meeting: addDays(now, 35) },
        { id: 's3', clubId: 'c1', meeting: addDays(now, 70) },
        { id: 's4', clubId: 'c2', meeting: addDays(now, 70) },
      ],
    }],
    ballots: [
      { cycleId: 'cycle1', clubId: 'c1', personId: 'p3', marks: { t1: 'selected', t2: 'selected' }, ranking: ['t1', 't2'] },
      { cycleId: 'cycle1', clubId: 'c1', personId: 'p4', marks: { t1: 'selected', t3: 'selected' }, ranking: ['t1', 't3'] },
      { cycleId: 'cycle1', clubId: 'c2', personId: 'p5', marks: { t1: 'selected', t2: 'selected' }, ranking: ['t1', 't2'] },
      { cycleId: 'cycle1', clubId: 'c2', personId: 'p6', marks: { t2: 'selected', t1: 'selected', t3: 'selected' }, ranking: ['t2', 't1', 't3'] },
    ],
    assignments: [],
    events: [{ id: 'event1', kitId: 'k5', action: 'inspected', at: new Date().toISOString(), notes: 'Demo kit inspected and ready.' }],
    selectedPersonId: 'p1',
  };
}
