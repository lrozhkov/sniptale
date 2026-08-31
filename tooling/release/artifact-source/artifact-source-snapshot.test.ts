import ts from 'typescript';
import { expect, it, vi } from 'vitest';

import { verifyDynamicCodeUsage } from '../artifact-security/artifact-security-dynamic.mjs';
import { createArtifactSourceSnapshotStore } from './artifact-source-snapshot.mjs';

it('parses one immutable artifact snapshot for every release scan consumer', () => {
  const createSourceFile = vi.fn(ts.createSourceFile);
  const store = createArtifactSourceSnapshotStore({ createSourceFile });
  const text = 'const safe = 1;\n';
  const first = store.get({ relativePath: 'assets/example.js', text });
  const second = store.get({ relativePath: 'assets/example.js', text });

  verifyDynamicCodeUsage('assets/example.js', first);
  expect(second).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  expect(createSourceFile).toHaveBeenCalledTimes(1);
  expect(store.getStats()).toEqual({ parseCount: 1, snapshotCount: 1 });
});

it('fails closed before scanning malformed release JavaScript', () => {
  const store = createArtifactSourceSnapshotStore();

  expect(() => store.get({ relativePath: 'assets/broken.js', text: 'function broken( {' })).toThrow(
    /malformed JavaScript/u
  );
  expect(store.getStats()).toEqual({ parseCount: 1, snapshotCount: 0 });
});
