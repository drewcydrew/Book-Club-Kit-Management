/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../src/state/api';
import { saveCatalogChange } from '../src/state/catalog-save';

const wrappedMutation = async (operation: () => Promise<unknown>) => {
  try { return await operation(); }
  catch (error: unknown) { throw new Error(error instanceof Error ? error.message : 'Save failed'); }
};

test('catalog save preserves validation and conflict classifications through the shared mutation wrapper', async () => {
  for (const [status, recovery] of [[400, null], [409, 'conflict'], [404, 'conflict']] as const) {
    const result = await saveCatalogChange(wrappedMutation, async () => { throw new ApiError('Rejected', status); });
    assert.deepEqual(result, { ok: false, message: 'Rejected', recovery });
  }
});

test('catalog save requires reconciliation after a network error or a saved write with failed refresh', async () => {
  const network = await saveCatalogChange(wrappedMutation, async () => { throw new Error('Connection lost'); });
  assert.deepEqual(network, { ok: false, message: 'Connection lost', recovery: 'uncertain' });

  let writes = 0;
  const refreshFailure = await saveCatalogChange(async (operation) => {
    await operation();
    throw new Error('Saved, but refresh failed');
  }, async () => { writes++; return {}; });
  assert.deepEqual(refreshFailure, { ok: false, message: 'Saved, but refresh failed', recovery: 'uncertain' });
  assert.equal(writes, 1);
});
