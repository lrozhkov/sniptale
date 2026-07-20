import { initDB, PAGE_STYLE_ASSETS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { PageStyleAssetEntry } from './contracts';
import type { PageStyleAssetKind } from '@sniptale/runtime-contracts/page-style';
import {
  PAGE_STYLE_LIMITS,
  assertPageStyleAssetWithinLimits,
} from '@sniptale/runtime-contracts/page-style/limits';

interface ExistingAssetBudgetEntry {
  id: string;
  size: number;
}

interface AssetBudgetCursor {
  continue: () => Promise<AssetBudgetCursor | null | undefined>;
  value: unknown;
}

interface AssetBudgetStore {
  count: () => Promise<number>;
  openCursor: () => Promise<AssetBudgetCursor | null | undefined>;
  put: (entry: PageStyleAssetEntry) => Promise<unknown>;
}

export interface SavePageStyleAssetInput {
  blob: Blob;
  filename: string;
  height?: number | null;
  id?: string;
  kind: PageStyleAssetKind;
  mimeType: string;
  width?: number | null;
}

function createId(): string {
  return crypto.randomUUID();
}

function createPageStyleAssetEntry(
  input: SavePageStyleAssetInput,
  id: string,
  now: number
): PageStyleAssetEntry {
  return {
    blob: input.blob,
    createdAt: now,
    filename: input.filename,
    height: input.height ?? null,
    id,
    kind: input.kind,
    mimeType: input.mimeType.toLowerCase(),
    size: input.blob.size,
    updatedAt: now,
    width: input.width ?? null,
  };
}

function getExistingAssetBytes(entries: ExistingAssetBudgetEntry[], replacementId: string): number {
  return entries.reduce((total, entry) => {
    return entry.id === replacementId ? total : total + entry.size;
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExistingAssetBudgetEntry(value: unknown): ExistingAssetBudgetEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const size = value['size'];
  if (
    typeof value['id'] !== 'string' ||
    typeof size !== 'number' ||
    !Number.isFinite(size) ||
    size < 0 ||
    size > PAGE_STYLE_LIMITS.maxAssetBytes
  ) {
    return null;
  }

  return { id: value['id'], size };
}

async function readExistingAssetBudgetEntries(
  store: AssetBudgetStore
): Promise<ExistingAssetBudgetEntry[]> {
  const storedAssetCount = await store.count();
  if (storedAssetCount > PAGE_STYLE_LIMITS.maxAssets) {
    throw new Error('Page style asset storage budget exceeded.');
  }

  const entries: ExistingAssetBudgetEntry[] = [];
  let cursor = await store.openCursor();

  while (cursor) {
    const entry = parseExistingAssetBudgetEntry(cursor.value);
    if (!entry) {
      throw new Error('Page style asset storage budget exceeded.');
    }

    entries.push(entry);
    if (entries.length > PAGE_STYLE_LIMITS.maxAssets) {
      throw new Error('Page style asset storage budget exceeded.');
    }

    cursor = await cursor.continue();
  }

  return entries;
}

async function assertPageStyleAssetBudget(store: AssetBudgetStore, entry: PageStyleAssetEntry) {
  const entries = await readExistingAssetBudgetEntries(store);
  const existingBytes = getExistingAssetBytes(entries, entry.id);
  const assetCount = entries.some((existing) => existing.id === entry.id)
    ? entries.length
    : entries.length + 1;

  if (
    assetCount > PAGE_STYLE_LIMITS.maxAssets ||
    existingBytes + entry.size > PAGE_STYLE_LIMITS.maxTotalAssetBytes
  ) {
    throw new Error('Page style asset storage budget exceeded.');
  }
}

export async function savePageStyleAsset(
  input: SavePageStyleAssetInput
): Promise<PageStyleAssetEntry> {
  assertPageStyleAssetWithinLimits(input);
  return runWithIndexedDbMutation(async (db) => {
    const id = input.id ?? createId();
    const entry = createPageStyleAssetEntry(input, id, Date.now());
    const tx = db.transaction(PAGE_STYLE_ASSETS_STORE, 'readwrite');
    const store = tx.store as AssetBudgetStore;

    await assertPageStyleAssetBudget(store, entry);
    await store.put(entry);
    await tx.done;
    return entry;
  });
}

export async function getPageStyleAsset(id: string): Promise<PageStyleAssetEntry | undefined> {
  const db = await initDB();
  return db.get(PAGE_STYLE_ASSETS_STORE, id) as Promise<PageStyleAssetEntry | undefined>;
}

export async function deletePageStyleAsset(id: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(PAGE_STYLE_ASSETS_STORE, id));
}
