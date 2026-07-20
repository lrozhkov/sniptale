import { describe, expect, it, vi } from 'vitest';

import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import { postNativeResponses } from './response-posting';

describe('native app response posting', () => {
  it('posts typed reject responses from resolved ingestion results', async () => {
    const post = vi.fn();
    const warn = vi.fn();
    const rejectMessage: NativeAppOutboundMessage = {
      captureId: 'capture-1',
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      reason: 'storage-failed',
      type: 'extension.screenshot.reject',
    };

    postNativeResponses(Promise.resolve([rejectMessage]), post, warn);
    await Promise.resolve();

    expect(post).toHaveBeenCalledWith(rejectMessage);
  });

  it('logs unexpected rejected ingestion promises without throwing', async () => {
    const post = vi.fn();
    const warn = vi.fn();

    postNativeResponses(Promise.reject(new Error('failed')), post, warn);
    await Promise.resolve();

    expect(post).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Native response failed');
  });

  it('accepts already resolved response arrays with the default warning sink', () => {
    const post = vi.fn();
    const warn = vi.fn();

    postNativeResponses([], post, warn);

    expect(post).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
