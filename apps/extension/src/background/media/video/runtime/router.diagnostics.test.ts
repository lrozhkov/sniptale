import { beforeEach, expect, it, vi } from 'vitest';

const { appendContentDiagnosticEventMock } = vi.hoisted(() => ({
  appendContentDiagnosticEventMock: vi.fn(),
}));

vi.mock('../../../diagnostics/public/event-sink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../diagnostics/public/event-sink')>()),
  appendContentDiagnosticEvent: appendContentDiagnosticEventMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes content diagnostics events through sender tab authority', () => {
  const result = routeVideoRuntimeMessage(
    {
      type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
      event: 'error:upload failed',
      level: 'error',
      payload: { action: 'upload' },
    },
    vi.fn(),
    42
  );

  expect(result).toEqual({ handled: true, keepChannelOpen: false });
  expect(appendContentDiagnosticEventMock).toHaveBeenCalledWith(
    {
      data: { action: 'upload' },
      kind: 'error',
      level: 'error',
      message: 'upload failed',
    },
    42
  );
});

it('preserves primitive content diagnostics payloads from the runtime contract', () => {
  const result = routeVideoRuntimeMessage(
    {
      type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
      event: 'action:typed',
      payload: 'redacted text summary',
    },
    vi.fn(),
    42
  );

  expect(result).toEqual({ handled: true, keepChannelOpen: false });
  expect(appendContentDiagnosticEventMock).toHaveBeenCalledWith(
    {
      data: 'redacted text summary',
      kind: 'action',
      message: 'typed',
    },
    42
  );
});

it('ignores content diagnostics events without sender tab authority', () => {
  const result = routeVideoRuntimeMessage(
    {
      type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
      event: 'action:clicked',
    },
    vi.fn()
  );

  expect(result).toEqual({ handled: true, keepChannelOpen: false });
  expect(appendContentDiagnosticEventMock).not.toHaveBeenCalled();
});
