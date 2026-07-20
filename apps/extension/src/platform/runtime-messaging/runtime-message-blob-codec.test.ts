import { expect, it, vi } from 'vitest';

import { parseRuntimeRequestMessage } from '../../contracts/messaging/parsers/boundary';
import { decodeRuntimeMessageBlobs } from '@sniptale/runtime-contracts/protocol/runtime-message-blob-codec';
import { VideoExportFormat, VideoExportQualityPreset } from '../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createRuntimeMessagingTransport } from './index';

it('sends only a bounded content-addressed handoff reference for project export', async () => {
  const runtimeSendMessage = vi.fn(async (_message: unknown) => ({
    capabilityToken: 'cancel-token-1',
    jobId: 'job-1',
    success: true,
  }));
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage,
    tabSendMessage: async () => ({ success: true }),
  });
  const input = {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };

  await transport.sendRuntimeMessage({
    capabilityToken: 'start-token-1',
    input,
    jobId: 'job-1',
    settings: createExportSettings(),
    type: VideoMessageType.START_PROJECT_EXPORT,
  });

  const sent = runtimeSendMessage.mock.calls[0]?.[0];
  expect(sent).toEqual(expect.objectContaining({ input }));
  expect(JSON.stringify(sent)).not.toContain('__sniptaleRuntimeBlob');
  expect(parseRuntimeRequestMessage(sent)).toEqual(expect.objectContaining({ input }));
});

it('keeps blob envelopes opaque on non-blob runtime routes', () => {
  const message = {
    event: 'renderer_probe',
    payload: {
      blob: {
        __sniptaleRuntimeBlob: true,
        base64: 'WA==',
        mimeType: 'text/plain',
        size: 1,
      },
    },
    type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
  };

  expect(parseRuntimeRequestMessage(message)).toEqual(message);
});

it('rejects oversized encoded blob envelopes before base64 decoding', () => {
  const atobSpy = vi.spyOn(globalThis, 'atob');

  expect(() =>
    decodeRuntimeMessageBlobs({
      __sniptaleRuntimeBlob: true,
      base64: 'A'.repeat(3_000_000),
      mimeType: 'application/javascript',
      size: 1,
    })
  ).toThrow(/message budget/);
  expect(atobSpy).not.toHaveBeenCalled();
});

function createExportSettings() {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.WEBM,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}
