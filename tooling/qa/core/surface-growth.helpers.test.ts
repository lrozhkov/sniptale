import { expect, it } from 'vitest';

import { collectSurfaceMaps, didSurfaceGrow } from './surface-growth.helpers.mjs';

it('treats new and widened surfaces as growth only when member counts increase', () => {
  expect(didSurfaceGrow({ members: 4 }, undefined)).toBe(true);
  expect(didSurfaceGrow({ members: 4 }, { members: 3 })).toBe(true);
  expect(didSurfaceGrow({ members: 4 }, { members: 4 })).toBe(false);
});

it('builds current and previous surface maps through the provided factories', () => {
  const collected = collectSurfaceMaps({
    filePath: 'example.ts',
    relativePath: 'src/example.ts',
    currentSourceFile: { version: 'current' },
    collectSurfaces: (source) => new Map([[source.version, { members: source.version.length }]]),
    resolvePreviousSource: () => 'previous',
    createPreviousSourceFile: (_filePath, text) => ({ version: text }),
  });

  expect(collected.currentSurfaces.get('current')).toEqual({ members: 7 });
  expect(collected.previousSurfaces.get('previous')).toEqual({ members: 8 });
});
