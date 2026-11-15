const { records } = require('./records');
const { object, text, integer, HttpError } = require('../http');
const { clubColumns } = require('./shared-selects');

module.exports = records({
  table: 'clubs',
  columns: ['name', 'branch', 'size', 'cadence', 'pickup', 'address'],
  select: clubColumns,
  validate(value) {
    const b = object(value);
    const pickup = text(b.pickup, 'pickup', true, 20);
    if (!['pickup', 'delivery'].includes(pickup)) throw new HttpError(400, 'pickup is invalid.');
    return [text(b.name, 'name', true, 200), text(b.branch, 'branch', true, 200), integer(b.size, 'size', 1),
      text(b.cadence, 'cadence', false, 200), pickup, text(b.address, 'address', pickup === 'delivery')];
  },
});
