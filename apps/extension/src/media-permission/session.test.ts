import { describe, expect, it, vi } from 'vitest';
import type { RecordingMediaPermissionBootstrap } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createRecordingMediaPermissionSession } from './session';

function bootstrap(
  deviceKind: 'audioinput' | 'videoinput' = 'audioinput'
): RecordingMediaPermissionBootstrap {
  return {
    type: 'recording-media-permission',
    request: {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: 'surface-1',
      surfaceToken: 'token-1',
      capabilityEpoch: 1,
      documentGeneration: 1,
      recordingId: null,
      command: { kind: 'list-media-devices', deviceKind, requestPermission: false },
    },
    locale: 'en',
    theme: 'light',
  };
}

function fixture() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  const dependencies = {
    authorize: vi.fn(async () => true),
    acquire: vi.fn(async (_kind: 'audioinput' | 'videoinput') => stream),
    policyAllows: vi.fn(() => true),
    report: vi.fn(),
  };
  return {
    stop,
    stream,
    dependencies,
    session: createRecordingMediaPermissionSession(dependencies),
  };
}

describe('recording media permission session', () => {
  it.each(['audioinput', 'videoinput'] as const)(
    'acquires only the requested %s after authority succeeds and retains the grant',
    async (kind) => {
      const { dependencies, stop, session } = fixture();
      const request = bootstrap(kind);
      await session.start(request);
      expect(dependencies.authorize).toHaveBeenCalledWith(request.request);
      expect(dependencies.acquire).toHaveBeenCalledExactlyOnceWith(kind);
      expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({ status: 'granted' });
      expect(stop).not.toHaveBeenCalled();
      session.dispose();
      session.dispose();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(dependencies.report).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    null,
    {},
    { ...bootstrap(), request: { ...bootstrap().request, command: { kind: 'stop' } } },
  ])('rejects invalid or mutating bootstrap before authority or acquisition', async (value) => {
    const { dependencies, session } = fixture();
    await session.start(value);
    expect(dependencies.authorize).not.toHaveBeenCalled();
    expect(dependencies.acquire).not.toHaveBeenCalled();
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({
      status: 'failed',
      reason: 'unauthorized',
    });
  });

  it('does not acquire when the lease is rejected', async () => {
    const { dependencies, session } = fixture();
    dependencies.authorize.mockResolvedValue(false);
    await session.start(bootstrap());
    expect(dependencies.acquire).not.toHaveBeenCalled();
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({
      status: 'failed',
      reason: 'unauthorized',
    });
  });

  it('does not acquire when authorization transport fails', async () => {
    const { dependencies, session } = fixture();
    dependencies.authorize.mockRejectedValue(new Error('No route'));
    await session.start(bootstrap());
    expect(dependencies.acquire).not.toHaveBeenCalled();
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({
      status: 'failed',
      reason: 'unauthorized',
    });
  });

  it('reports restrictive host policy without a request or navigation', async () => {
    const { dependencies, session } = fixture();
    dependencies.policyAllows.mockReturnValue(false);
    await session.start(bootstrap());
    expect(dependencies.acquire).not.toHaveBeenCalled();
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({
      status: 'failed',
      reason: 'policy',
    });
  });

  it.each([
    { error: new DOMException('Permission denied', 'NotAllowedError'), reason: 'denied' },
    { error: new DOMException('Device busy', 'NotReadableError'), reason: 'unavailable' },
    { error: new Error('Unavailable'), reason: 'unavailable' },
  ])('reports device acquisition failure as $reason', async ({ error, reason }) => {
    const { dependencies, session } = fixture();
    dependencies.acquire.mockRejectedValue(error);
    await session.start(bootstrap());
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({ status: 'failed', reason });
  });

  it('does not report a grant for an empty acquired stream', async () => {
    const { dependencies, session } = fixture();
    dependencies.acquire.mockResolvedValue({ getTracks: () => [] });
    await session.start(bootstrap());
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({
      status: 'failed',
      reason: 'unavailable',
    });
  });

  it('does not duplicate acquisition when bootstrap is repeated', async () => {
    const { dependencies, session } = fixture();
    await Promise.all([session.start(bootstrap()), session.start(bootstrap('videoinput'))]);
    expect(dependencies.authorize).toHaveBeenCalledTimes(1);
    expect(dependencies.acquire).toHaveBeenCalledExactlyOnceWith('audioinput');
  });

  it('cancels before authority completion without opening the device', async () => {
    const { dependencies, session } = fixture();
    const authority = Promise.withResolvers<boolean>();
    dependencies.authorize.mockReturnValue(authority.promise);
    const pending = session.start(bootstrap());
    session.cancel();
    session.cancel();
    authority.resolve(true);
    await pending;
    expect(dependencies.acquire).not.toHaveBeenCalled();
    expect(dependencies.report).toHaveBeenCalledExactlyOnceWith({ status: 'cancelled' });
  });

  it.each(['cancel', 'dispose'] as const)(
    'stops a late stream after %s and never reports a grant',
    async (operation) => {
      const { dependencies, session, stream, stop } = fixture();
      const acquisition = Promise.withResolvers<typeof stream>();
      const entered = Promise.withResolvers<void>();
      dependencies.acquire.mockImplementation(() => {
        entered.resolve();
        return acquisition.promise;
      });
      const pending = session.start(bootstrap());
      await entered.promise;
      session[operation]();
      acquisition.resolve(stream);
      await pending;
      expect(stop).toHaveBeenCalledTimes(1);
      expect(dependencies.report.mock.calls).toEqual(
        operation === 'cancel' ? [[{ status: 'cancelled' }]] : []
      );
    }
  );

  it('stops active tracks when the user cancels and cannot restart a retired session', async () => {
    const { dependencies, stop, session } = fixture();
    await session.start(bootstrap());
    session.cancel();
    await session.start(bootstrap('videoinput'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(dependencies.acquire).toHaveBeenCalledTimes(1);
    expect(dependencies.report.mock.calls).toEqual([
      [{ status: 'granted' }],
      [{ status: 'cancelled' }],
    ]);
  });
});
