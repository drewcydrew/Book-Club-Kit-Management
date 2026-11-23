const { records } = require('./records');
const { object, text, integer, HttpError } = require('../http');
const { clubColumns } = require('./shared-selects');
const { previewClubDeletion, deleteClub } = require('./club-deletion');

const router = records({
  table: 'clubs',
  columns: ['name', 'branch', 'size', 'cadence', 'cadence_offset', 'meeting_weekday', 'meeting_occurrence', 'pickup_weekday', 'pickup_occurrence', 'pickup_at_previous_meeting', 'pickup', 'address'],
  select: clubColumns,
  remove: deleteClub,
  validate(value) {
    const b = object(value);
    const pickup = text(b.pickup, 'pickup', true, 20);
    if (!['pickup', 'delivery'].includes(pickup)) throw new HttpError(400, 'pickup is invalid.');
    if (b.cadence !== 1 && b.cadence !== 1.5 && b.cadence !== 2) throw new HttpError(400, 'cadence must be 1 (monthly), 1.5 (six weeks) or 2 (every six weeks).');
    if (![0, 1, 2].includes(b.cadenceOffset)) throw new HttpError(400, 'cadenceOffset must be 0, 1 or 2.');
    if (!Number.isInteger(b.meetingWeekday) || b.meetingWeekday < 0 || b.meetingWeekday > 6) throw new HttpError(400, 'meetingWeekday must be 0 through 6.');
    if (![1, 2, 3, 4, -1].includes(b.meetingOccurrence)) throw new HttpError(400, 'meetingOccurrence must be 1 through 4 or -1 (last).');
    if (!Number.isInteger(b.pickupWeekday) || b.pickupWeekday < 0 || b.pickupWeekday > 6) throw new HttpError(400, 'pickupWeekday must be 0 through 6.');
    if (![1, 2, 3, 4, -1].includes(b.pickupOccurrence)) throw new HttpError(400, 'pickupOccurrence must be 1 through 4 or -1 (last).');
    if (typeof b.pickupAtPreviousMeeting !== 'boolean') throw new HttpError(400, 'pickupAtPreviousMeeting must be true or false.');
    if (b.pickupAtPreviousMeeting && b.cadence !== 1.5) throw new HttpError(400, 'pickupAtPreviousMeeting is only available for six-weekly clubs.');
    return [text(b.name, 'name', true, 200), text(b.branch, 'branch', true, 200), integer(b.size, 'size', 1),
      b.cadence, b.cadence === 2 ? 0 : b.cadenceOffset, b.meetingWeekday, b.meetingOccurrence, b.pickupWeekday, b.pickupOccurrence, b.pickupAtPreviousMeeting, pickup, text(b.address, 'address', pickup === 'delivery')];
  },
});
router.post('/:id/deletion-preview', previewClubDeletion);
module.exports = router;
