import { expect, it } from 'vitest';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseOffscreenRuntimeMessage, parseRuntimeResponseForMessage } from './boundary';

const capabilityToken = 'capability-token';

it('parses the strict desktop frame command and supported formats', () => {
  for (const imageFormat of ['png', 'jpeg', 'webp'] as const) {
    expect(
      parseOffscreenRuntimeMessage({
        type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
        capabilityToken,
        requestId: `request-${imageFormat}`,
        streamId: 'one-shot-stream',
        imageFormat,
        imageQuality: 85,
      })
    ).toEqual(expect.objectContaining({ imageFormat }));
  }
});

it('rejects malformed formats, quality, correlation ids, and extra fields', () => {
  const valid = {
    type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
    capabilityToken,
    requestId: 'request-1',
    streamId: 'one-shot-stream',
    imageFormat: 'png',
    imageQuality: 85,
  };

  for (const message of [
    { ...valid, imageFormat: 'gif' },
    { ...valid, imageQuality: 0 },
    { ...valid, requestId: '' },
    { ...valid, extra: true },
  ]) {
    expect(() => parseOffscreenRuntimeMessage(message)).toThrow(MessageContractError);
  }
});

it('requires complete successful desktop-frame responses', () => {
  expect(
    parseRuntimeResponseForMessage(MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME, {
      success: true,
      result: 'captured',
      dataUrl: 'data:image/png;base64,AA==',
      width: 1280,
      height: 720,
    })
  ).toEqual(expect.objectContaining({ result: 'captured' }));

  expect(() =>
    parseRuntimeResponseForMessage(MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME, {
      success: true,
      result: 'captured',
    })
  ).toThrow(MessageContractError);
});

it('accepts only PNG artifacts at the clipboard boundary', () => {
  expect(
    parseOffscreenRuntimeMessage({
      type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
      capabilityToken,
      requestId: 'request-1:clipboard',
      dataUrl: 'data:image/png;base64,AA==',
    })
  ).toEqual(expect.objectContaining({ type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD }));

  expect(() =>
    parseOffscreenRuntimeMessage({
      type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
      capabilityToken,
      requestId: 'request-1:clipboard',
      dataUrl: 'data:image/webp;base64,AA==',
    })
  ).toThrow(MessageContractError);
});
