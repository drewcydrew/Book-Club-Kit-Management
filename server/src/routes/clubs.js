const { records } = require('./records');
const { object, text, integer, HttpError } = require('../http');
const { clubColumns } = require('./shared-selects');
const { previewClubDeletion, deleteClub } = require('./club-deletion');

const router = records({
  table: 'clubs',
  columns: ['name', 'branch', 'size', 'cadence', 'pickup', 'address'],
  select: clubColumns,
  remove: deleteClub,
  validate(value) {
    const b = object(value);
    const pickup = text(b.pickup, 'pickup', true, 20);
    if (!['pickup', 'delivery'].includes(pickup)) throw new HttpError(400, 'pickup is invalid.');
    if (b.cadence !== 1 && b.cadence !== 1.5) throw new HttpError(400, 'cadence must be 1 (monthly) or 1.5 (six weeks).');
    return [text(b.name, 'name', true, 200), text(b.branch, 'branch', true, 200), integer(b.size, 'size', 1),
      b.cadence, pickup, text(b.address, 'address', pickup === 'delivery')];
  },
});
router.post('/:id/deletion-preview', previewClubDeletion);
module.exports = router;
