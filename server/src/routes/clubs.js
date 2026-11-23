const { records } = require('./records');
const { object, text, integer, HttpError } = require('../http');
const { clubColumns } = require('./shared-selects');
const { previewClubDeletion, deleteClub } = require('./club-deletion');
const { list, unique, expected, transaction, one, stale } = require('./workflow-util');

function clubRule(b) {
  if (b.cadence !== 1 && b.cadence !== 2) throw new HttpError(400, 'cadence must be 1 (monthly) or 2 (every six weeks).');
  if (!Number.isInteger(b.meetingWeekday) || b.meetingWeekday < 0 || b.meetingWeekday > 6) throw new HttpError(400, 'meetingWeekday must be 0 through 6.');
  if (![1, 2, 3, 4, -1].includes(b.meetingOccurrence)) throw new HttpError(400, 'meetingOccurrence must be 1 through 4 or -1 (last).');
  if (!Number.isInteger(b.pickupOffsetDays) || b.pickupOffsetDays < -7 || b.pickupOffsetDays > 7) throw new HttpError(400, 'pickupOffsetDays must be -7 through 7.');
  if (!Number.isInteger(b.skipMonths) || b.skipMonths < 0 || b.skipMonths > 4095) throw new HttpError(400, 'skipMonths must be 0 through 4095.');
  return [b.cadence, b.meetingWeekday, b.meetingOccurrence, b.pickupOffsetDays, b.skipMonths];
}

const router = records({
  table: 'clubs',
  columns: ['name', 'branch', 'size', 'cadence', 'meeting_weekday', 'meeting_occurrence', 'pickup_offset_days', 'skip_months', 'pickup', 'address'],
  select: clubColumns,
  remove: deleteClub,
  validate(value) {
    const b = object(value);
    const pickup = text(b.pickup, 'pickup', true, 20);
    if (!['pickup', 'delivery'].includes(pickup)) throw new HttpError(400, 'pickup is invalid.');
    return [text(b.name, 'name', true, 200), text(b.branch, 'branch', true, 200), integer(b.size, 'size', 1),
      ...clubRule(b), pickup, text(b.address, 'address', pickup === 'delivery')];
  },
});
router.post('/:id/deletion-preview', previewClubDeletion);
// Rule-only updates for many clubs. All rows apply in one transaction, so any stale revision or invalid row changes nothing.
router.post('/import', async (req, res) => {
  const updates = list(object(req.body).rows, 'rows', 500).map((row) => {
    const b = object(row);
    return { id: text(b.id, 'id', true, 100), revision: expected(b.revision), rule: clubRule(b) };
  });
  unique(updates.map((update) => update.id), 'Club ids');
  const clubs = await transaction(async (c) => {
    const updated = [];
    for (const update of updates) {
      const club = await one(c, 'SELECT id,revision FROM clubs WHERE id=$1 FOR UPDATE', [update.id], 'Club');
      stale(club.revision, update.revision);
      const result = await c.query(
        `UPDATE clubs SET cadence=$2,meeting_weekday=$3,meeting_occurrence=$4,pickup_offset_days=$5,skip_months=$6,revision=revision+1 WHERE id=$1 RETURNING ${clubColumns}`,
        [update.id, ...update.rule],
      );
      updated.push(result.rows[0]);
    }
    return updated;
  });
  res.json(clubs);
});
module.exports = router;
