import {
  parseContextMenuTree,
  type ContextMenuTree,
} from '../../../contracts/settings/context-menu-layout';
import type { Settings } from '../../../contracts/settings';

const CHUNK_BYTES = 4096;
const MAX_CHUNKS = 64;
const MAX_DECOMPRESSED_BYTES = 1024 * 1024;
const CHUNK_PREFIX = 'sniptale_context_menu_layout_';
const SETTINGS_KEY = 'sniptale_settings';
const MANIFEST_FIELD = 'contextMenuLayoutChunks';
const SYNC_ITEM_SAFE_BYTES = 8000;

interface ContextMenuLayoutChunkManifest {
  version: 1;
  encoding: 'gzip';
  id: string;
  count: number;
}

export function parseContextMenuLayoutChunkManifest(
  value: unknown
): ContextMenuLayoutChunkManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return candidate['version'] === 1 &&
    candidate['encoding'] === 'gzip' &&
    typeof candidate['id'] === 'string' &&
    /^[0-9a-f-]{36}$/u.test(candidate['id']) &&
    Number.isInteger(candidate['count']) &&
    (candidate['count'] as number) >= 1 &&
    (candidate['count'] as number) <= MAX_CHUNKS
    ? {
        version: 1,
        encoding: 'gzip',
        id: candidate['id'],
        count: candidate['count'] as number,
      }
    : null;
}

export function contextMenuLayoutChunkKeys(manifest: ContextMenuLayoutChunkManifest): string[] {
  return Array.from(
    { length: manifest.count },
    (_, index) => `${CHUNK_PREFIX}${manifest.id}_${index}`
  );
}

export async function encodeContextMenuLayoutChunks(layout: ContextMenuTree): Promise<{
  manifest: ContextMenuLayoutChunkManifest;
  values: Record<string, string>;
}> {
  const serialized = JSON.stringify(layout);
  if (new TextEncoder().encode(serialized).length > MAX_DECOMPRESSED_BYTES)
    throw new Error('Context menu layout exceeds sync storage');
  const compressed = new Blob([serialized]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  const count = Math.ceil(bytes.length / CHUNK_BYTES);
  if (count < 1 || count > MAX_CHUNKS) throw new Error('Context menu layout exceeds sync storage');
  const manifest: ContextMenuLayoutChunkManifest = {
    version: 1,
    encoding: 'gzip',
    id: crypto.randomUUID(),
    count,
  };
  const values: Record<string, string> = {};
  for (const [index, key] of contextMenuLayoutChunkKeys(manifest).entries()) {
    const chunk = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    values[key] = btoa(Array.from(chunk, (byte) => String.fromCharCode(byte)).join(''));
  }
  return { manifest, values };
}

export async function decodeContextMenuLayoutChunks(
  manifest: ContextMenuLayoutChunkManifest,
  values: Record<string, unknown>
): Promise<ContextMenuTree | null> {
  const chunks: Uint8Array[] = [];
  try {
    for (const key of contextMenuLayoutChunkKeys(manifest)) {
      const encoded = values[key];
      if (typeof encoded !== 'string' || encoded.length > 6000) return null;
      chunks.push(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
    }
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const reader = new Blob([bytes.buffer as ArrayBuffer])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
      .getReader();
    const output: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        return null;
      }
      output.push(value);
    }
    const decoded = new Uint8Array(total);
    let decodedOffset = 0;
    for (const part of output) {
      decoded.set(part, decodedOffset);
      decodedOffset += part.length;
    }
    return parseContextMenuTree(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded))
    );
  } catch {
    return null;
  }
}

export async function prepareContextMenuSettingsSyncWrite(
  settings: Settings,
  previousManifest: ContextMenuLayoutChunkManifest | null,
  previousLayout: ContextMenuTree | null
): Promise<{
  settingsValue: Record<string, unknown>;
  chunkValues: Record<string, string>;
  newChunkKeys: string[];
  retiredChunkKeys: string[];
}> {
  const layout = settings.contextMenu.layout;
  const inlineBytes = new TextEncoder().encode(SETTINGS_KEY + JSON.stringify(settings)).length;
  if (inlineBytes <= SYNC_ITEM_SAFE_BYTES || !layout || layout.version !== 2) {
    if (inlineBytes > SYNC_ITEM_SAFE_BYTES)
      throw new Error('Settings payload exceeds sync storage');
    return {
      settingsValue: { ...settings },
      chunkValues: {},
      newChunkKeys: [],
      retiredChunkKeys: previousManifest ? contextMenuLayoutChunkKeys(previousManifest) : [],
    };
  }
  const reuse =
    previousManifest !== null &&
    previousLayout !== null &&
    JSON.stringify(previousLayout) === JSON.stringify(layout);
  const encoded = reuse ? null : await encodeContextMenuLayoutChunks(layout);
  const manifest = reuse ? previousManifest : encoded!.manifest;
  const { layout: _layout, ...contextMenuWithoutLayout } = settings.contextMenu;
  const settingsValue = {
    ...settings,
    contextMenu: contextMenuWithoutLayout,
    [MANIFEST_FIELD]: manifest,
  };
  if (
    new TextEncoder().encode(SETTINGS_KEY + JSON.stringify(settingsValue)).length >
    SYNC_ITEM_SAFE_BYTES
  )
    throw new Error('Settings payload exceeds sync storage');
  return {
    settingsValue,
    chunkValues: encoded?.values ?? {},
    newChunkKeys: encoded ? contextMenuLayoutChunkKeys(encoded.manifest) : [],
    retiredChunkKeys:
      previousManifest && !reuse ? contextMenuLayoutChunkKeys(previousManifest) : [],
  };
}
