import { expect, it } from 'vitest';
import type { ContextMenuTree } from '../../../contracts/settings/context-menu-layout';
import {
  contextMenuLayoutChunkKeys,
  decodeContextMenuLayoutChunks,
  encodeContextMenuLayoutChunks,
  parseContextMenuLayoutChunkManifest,
} from './context-menu-layout-chunks';

it('round-trips a large tree through individually quota-safe sync items', async () => {
  const layout: ContextMenuTree = {
    version: 2,
    nodes: [
      {
        type: 'section',
        id: 'screenshots',
        title: 'Screenshots',
        enabled: true,
        children: [
          {
            type: 'section',
            id: 'quick-actions',
            title: 'Quick actions',
            enabled: true,
            children: Array.from({ length: 100 }, (_, index) => ({
              type: 'command' as const,
              command: `sniptale.screenshots.quick-action.action-${index}`,
              enabled: true,
            })),
          },
        ],
      },
    ],
  };
  const { manifest, values } = await encodeContextMenuLayoutChunks(layout);
  expect(parseContextMenuLayoutChunkManifest(manifest)).toEqual(manifest);
  expect(contextMenuLayoutChunkKeys(manifest)).toHaveLength(manifest.count);
  expect(manifest.count).toBeGreaterThan(0);
  for (const [key, value] of Object.entries(values)) {
    expect(new TextEncoder().encode(key + JSON.stringify(value)).length).toBeLessThan(8192);
  }
  await expect(decodeContextMenuLayoutChunks(manifest, values)).resolves.toEqual(layout);
  await expect(
    decodeContextMenuLayoutChunks(manifest, { ...values, [Object.keys(values)[0]!]: null })
  ).resolves.toBeNull();
});

it('rejects a hostile chunk manifest without constructing storage keys', () => {
  expect(
    parseContextMenuLayoutChunkManifest({ version: 1, encoding: 'gzip', id: '../bad', count: 1 })
  ).toBeNull();
  expect(
    parseContextMenuLayoutChunkManifest({
      version: 1,
      encoding: 'gzip',
      id: crypto.randomUUID(),
      count: 1000,
    })
  ).toBeNull();
});

it('rejects a layout that could be saved compressed but cannot be decoded within the size limit', async () => {
  const layout: ContextMenuTree = {
    version: 2,
    nodes: [{ type: 'command', command: 'x'.repeat(1024 * 1024), enabled: true }],
  };
  await expect(encodeContextMenuLayoutChunks(layout)).rejects.toThrow(
    'Context menu layout exceeds sync storage'
  );
});
