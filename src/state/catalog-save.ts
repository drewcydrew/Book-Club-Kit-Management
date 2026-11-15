import { ApiError } from './api';

type CatalogSaveResult =
  | { ok: true }
  | { ok: false; message: string; recovery: 'conflict' | 'uncertain' | null };

export async function saveCatalogChange(
  mutate: (operation: () => Promise<unknown>) => Promise<unknown>,
  operation: () => Promise<unknown>,
): Promise<CatalogSaveResult> {
  let saved = false;
  let requestError: unknown;
  try {
    await mutate(async () => {
      try {
        const result = await operation();
        saved = true;
        return result;
      } catch (error: unknown) {
        requestError = error;
        throw error;
      }
    });
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to save changes.',
      recovery: saved || !(requestError instanceof ApiError)
        ? 'uncertain'
        : requestError.status === 400 ? null : 'conflict',
    };
  }
}
