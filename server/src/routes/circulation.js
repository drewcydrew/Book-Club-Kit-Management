const express = require('express');
const { randomUUID } = require('node:crypto');
const { HttpError, object, text, integer, boolean } = require('../http');
const { id, date, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
const transitions = { reserved:['available'], 'picked up':['available','reserved'], delivered:['available','reserved'], returned:['out'], inspected:['inspection'], resolved:['unavailable'] };
router.post('/kits/:kitId/events', async (req,res) => {
  const b = object(req.body); const kitId = id(req.params.kitId); const eventId = b.id === undefined ? randomUUID() : id(b.id);
  const action = text(b.action,'action',true,20); if (!Object.hasOwn(transitions,action)) throw new HttpError(400,'action is invalid.');
  const at = b.at; if (typeof at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(at) || Number.isNaN(Date.parse(at))) throw new HttpError(400,'at is invalid.');
  date(at.slice(0,10), 'at');
  const notes = text(b.notes,'notes',false,2000); const rev = expected(b.revision);
  const returned = b.returnedCopies === undefined ? null : integer(b.returnedCopies,'returnedCopies',0);
  const missing = b.missingComponents === undefined ? null : unique(list(b.missingComponents,'missingComponents').map((x) => text(x,'component',true,200)),'missingComponents');
  if (action !== 'inspected' && (returned !== null || missing !== null)) throw new HttpError(400,'Inspection details are only valid for inspections.');
  const complete = b.complete === undefined && action !== 'inspected' ? false : boolean(b.complete,'complete');
  const result = await transaction(async (c) => {
    const kit = await one(c,'SELECT revision,status,copies FROM kits WHERE id=$1 FOR UPDATE',[kitId],'Kit'); stale(kit.revision,rev);
    if (!transitions[action].includes(kit.status)) throw new HttpError(409,'This circulation action is not valid for the kit’s current status.');
    if (returned !== null && returned > kit.copies) throw new HttpError(400,'returnedCopies exceeds kit copies.');
    if (missing) {
      const components = (await c.query("SELECT identifier FROM kit_identifiers WHERE kit_id=$1 AND kind='copy'",[kitId])).rows.map((r) => r.identifier);
      if (missing.some((part) => !components.includes(part))) throw new HttpError(400,'Unknown missing component.');
    }
    const status = action === 'reserved' ? 'reserved' : ['picked up','delivered'].includes(action) ? 'out' : action === 'returned' ? 'inspection' :
      action === 'resolved' || (complete && (returned === null || returned === kit.copies) && (!missing || missing.length === 0)) ? 'available' : 'unavailable';
    await c.query('INSERT INTO circulation_events(id,kit_id,action,at,notes,returned_copies,missing_components) VALUES($1,$2,$3,$4,$5,$6,$7)',[eventId,kitId,action,at,notes,returned,missing]);
    const updated = await c.query('UPDATE kits SET status=$2,revision=revision+1 WHERE id=$1 RETURNING revision,status',[kitId,status]);
    return updated.rows[0];
  });
  res.status(201).json(result);
});
module.exports = router;
