const { records } = require('./records');
const { object, text, integer, HttpError } = require('../http');
const { clubColumns } = require('./shared-selects');
const { previewClubDeletion, deleteClub } = require('./club-deletion');

const router = records({
  table: 'clubs',
  columns: ['name', 'branch', 'size', 'cadence', 'meeting_weekday', 'meeting_occurrence', 'pickup_offset_days', 'skip_months', 'pickup', 'address'],
  select: clubColumns,
  remove: deleteClub,
  validate(value) {
    const b = object(value);
    const pickup = text(b.pickup, 'pickup', true, 20);
    if (!['pickup', 'delivery'].includes(pickup)) throw new HttpError(400, 'pickup is invalid.');
    if (b.cadence !== 1 && b.cadence !== 2) throw new HttpError(400, 'cadence must be 1 (monthly) or 2 (every six weeks).');
    if (!Number.isInteger(b.meetingWeekday) || b.meetingWeekday < 0 || b.meetingWeekday > 6) throw new HttpError(400, 'meetingWeekday must be 0 through 6.');
    if (![1, 2, 3, 4, -1].includes(b.meetingOccurrence)) throw new HttpError(400, 'meetingOccurrence must be 1 through 4 or -1 (last).');
    if (!Number.isInteger(b.pickupOffsetDays) || b.pickupOffsetDays < -7 || b.pickupOffsetDays > 7) throw new HttpError(400, 'pickupOffsetDays must be -7 through 7.');
    if (!Number.isInteger(b.skipMonths) || b.skipMonths < 0 || b.skipMonths > 4095) throw new HttpError(400, 'skipMonths must be 0 through 4095.');
    return [text(b.name, 'name', true, 200), text(b.branch, 'branch', true, 200), integer(b.size, 'size', 1),
      b.cadence, b.meetingWeekday, b.meetingOccurrence, b.pickupOffsetDays, b.skipMonths, pickup, text(b.address, 'address', pickup === 'delivery')];
  },
});
router.post('/:id/deletion-preview', previewClubDeletion);
module.exports = router;
