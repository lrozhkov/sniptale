import { describe, expect, it, vi } from 'vitest';
import { createEffectBundleFailure } from '../diagnostics';
import { importAnimationArtifact } from './index';
vi.mock('./worker/index?worker&inline', () => ({ default: class {} }));

describe('animation artifact byte dispatch', () => {
  it.each([[0x50, 0x4b, 0x01, 0x02], [0x50, 0x4b], [0x5b]])(
    'rejects unknown bytes before creating a worker: %j',
    async (...bytes) => {
      const workerFactory = vi.fn();
      await expect(
        importAnimationArtifact(Uint8Array.from(bytes), { workerFactory })
      ).resolves.toMatchObject({ ok: false, primaryCode: 'BUNDLE_ARCHIVE_INVALID' });
      expect(workerFactory).not.toHaveBeenCalled();
    }
  );
  it('bounds and sanitizes diagnostic context at the boundary', () => {
    const failure = createEffectBundleFailure(
      'BUNDLE_ARCHIVE_INVALID',
      '$artifact',
      `\u0000 unsafe\n${'x'.repeat(300)}`
    );
    expect(failure.diagnostics[0]?.context).toHaveLength(256);
    expect(
      [...(failure.diagnostics[0]?.context ?? '')].some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      })
    ).toBe(false);
  });
});
