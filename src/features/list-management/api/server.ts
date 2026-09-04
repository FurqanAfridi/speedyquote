import { createServerFn } from '@tanstack/react-start';
import { requireSignedInUser } from '@/lib/supabase/server';
import { lookupAttributes } from '@/features/pin-lookup/lookup';
import {
  createLookupApiKey,
  listLookupApiKeys,
  revokeLookupApiKey
} from './keys';
import {
  createExtraColumn,
  deleteExtraColumn,
  deleteRecords,
  deleteUploadBatch,
  getOverviewStats,
  getPortalSettings,
  listLookupLogs,
  listRecords,
  listUploadBatches,
  savePortalSettings,
  updateRecord,
  uploadList
} from './service';
import type { PortalSettings, RecordMutationInput, UploadListInput } from './types';

async function gate() {
  try {
    await requireSignedInUser();
  } catch {
    if (!import.meta.env.DEV) throw new Error('Sign in required');
  }
}

export const getListUploadOptions = createServerFn({ method: 'GET' }).handler(async () => {
  await gate();
  const [recentPins, logs, settings, batches] = await Promise.all([
    listRecords(),
    listLookupLogs(80),
    getPortalSettings().catch(() => null),
    listUploadBatches(100).catch(() => [] as Awaited<ReturnType<typeof listUploadBatches>>)
  ]);
  return { recentPins, logs, settings, batches };
});

export const fetchPortalSettings = createServerFn({ method: 'GET' }).handler(async () => {
  await gate();
  return getPortalSettings();
});

export const updatePortalSettings = createServerFn({ method: 'POST' })
  .validator((data: PortalSettings) => data)
  .handler(async ({ data }) => {
    await gate();
    return savePortalSettings(data);
  });

export const createExtraColumnFn = createServerFn({ method: 'POST' })
  .validator((data: { key: string; default_value?: string }) => data)
  .handler(async ({ data }) => {
    await gate();
    return createExtraColumn(data);
  });

export const deleteExtraColumnFn = createServerFn({ method: 'POST' })
  .validator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    await gate();
    return deleteExtraColumn(data.key);
  });

export const fetchOverview = createServerFn({ method: 'GET' }).handler(async () => {
  await gate();
  return getOverviewStats();
});

export const uploadMailingList = createServerFn({ method: 'POST' })
  .validator((data: UploadListInput) => data)
  .handler(async ({ data }) => {
    await gate();
    return uploadList(data);
  });

export const updateRecordFn = createServerFn({ method: 'POST' })
  .validator((data: RecordMutationInput) => data)
  .handler(async ({ data }) => {
    await gate();
    await updateRecord(data);
    return { ok: true };
  });

export const deleteRecordsFn = createServerFn({ method: 'POST' })
  .validator((data: { recordIds: number[] }) => data)
  .handler(async ({ data }) => {
    await gate();
    const deleted = await deleteRecords(data.recordIds);
    return { deleted };
  });

export const deleteUploadBatchFn = createServerFn({ method: 'POST' })
  .validator((data: { batchId: number }) => data)
  .handler(async ({ data }) => {
    await gate();
    return deleteUploadBatch(data.batchId);
  });

export const testPinLookupFn = createServerFn({ method: 'POST' })
  .validator((data: { pin?: string; zip?: string; caller_id?: string }) => data)
  .handler(async ({ data }) => {
    await gate();
    const { body, latencyMs } = await lookupAttributes(data);
    return { ...body, latency_ms: latencyMs };
  });

export const fetchLookupApiKeys = createServerFn({ method: 'GET' }).handler(async () => {
  await gate();
  return listLookupApiKeys();
});

export const createLookupApiKeyFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    await gate();
    return createLookupApiKey(data.name);
  });

export const revokeLookupApiKeyFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await gate();
    await revokeLookupApiKey(data.id);
    return { ok: true };
  });
