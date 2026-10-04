import { afterEach, expect, it, vi } from 'vitest';
import {
  tryVoiceoverAttachmentLock,
  withVoiceoverAttachmentLock,
} from './voiceover-publication-lock';

afterEach(() => vi.unstubAllGlobals());

it('defers recovery during an attachment and resumes after its lock is released', async () => {
  vi.stubGlobal('navigator', undefined);
  let release!: () => void;
  const attachment = withVoiceoverAttachmentLock(
    'asset-1',
    () => new Promise<void>((resolve) => (release = resolve))
  );
  expect(await tryVoiceoverAttachmentLock('asset-1', async () => 'recovered')).toBe('defer');
  expect(await tryVoiceoverAttachmentLock('asset-2', async () => 'other')).toBe('other');
  release();
  await attachment;
  expect(await tryVoiceoverAttachmentLock('asset-1', async () => 'recovered')).toBe('recovered');
});

it('queues another attachment and releases the lock after an operation fails', async () => {
  vi.stubGlobal('navigator', undefined);
  const order: number[] = [];
  const first = withVoiceoverAttachmentLock('asset-1', async () => {
    order.push(1);
    await Promise.resolve();
    order.push(2);
    throw new Error('attach failed');
  });
  const second = withVoiceoverAttachmentLock('asset-1', async () => {
    order.push(3);
  });
  await expect(first).rejects.toThrow('attach failed');
  await second;
  expect(order).toEqual([1, 2, 3]);
  expect(await tryVoiceoverAttachmentLock('asset-1', async () => 'ready')).toBe('ready');
});

it('uses a cross-context Web Lock and handles an unavailable recovery lock', async () => {
  const requests: Array<{ name: string; ifAvailable: boolean | undefined }> = [];
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        options: { ifAvailable?: boolean },
        operation: (lock: object | null) => Promise<unknown> | string
      ) => {
        requests.push({ name, ifAvailable: options.ifAvailable });
        return operation(options.ifAvailable ? null : {});
      },
    },
  });
  expect(await withVoiceoverAttachmentLock('asset-1', async () => 'attached')).toBe('attached');
  expect(await tryVoiceoverAttachmentLock('asset-1', async () => 'published')).toBe('defer');
  expect(requests).toEqual([
    { name: 'sniptale:voiceover-publication:asset-1', ifAvailable: undefined },
    { name: 'sniptale:voiceover-publication:asset-1', ifAvailable: true },
  ]);
});

it('fails closed when Web Locks are unavailable in the extension runtime', async () => {
  vi.stubGlobal('navigator', undefined);
  vi.stubGlobal('chrome', {});
  await expect(withVoiceoverAttachmentLock('asset-1', async () => undefined)).rejects.toThrow(
    'requires Web Locks'
  );
  await expect(tryVoiceoverAttachmentLock('asset-1', async () => undefined)).rejects.toThrow(
    'requires Web Locks'
  );
});
