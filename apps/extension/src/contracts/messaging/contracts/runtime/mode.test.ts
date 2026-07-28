import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeModeMessageContracts } from './mode';

describe('runtimeModeMessageContracts', () => {
  it('accepts a narrow content intent on screenshot enable and rejects malformed intent', () => {
    const contract = runtimeModeMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE];
    expect(
      contract.parseRequest({
        contentIntent: { requestId: 'request-1', token: 'token-1' },
        type: MessageType.ENABLE_SCREENSHOT_MODE,
      })
    ).toEqual({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      type: MessageType.ENABLE_SCREENSHOT_MODE,
    });
    expect(() =>
      contract.parseRequest({
        contentIntent: { requestId: 'request-1' },
        type: MessageType.ENABLE_SCREENSHOT_MODE,
      })
    ).toThrow(/ENABLE_SCREENSHOT_MODE/);
  });

  it('accepts routed screenshot mode async ack responses', () => {
    expect(
      runtimeModeMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE].parseResponse({
        success: true,
        result: 'accepted',
      })
    ).toEqual({
      success: true,
      result: 'accepted',
    });
  });

  it('accepts tab-scoped screenshot mode status responses', () => {
    expect(
      runtimeModeMessageContracts[MessageType.SCREENSHOT_MODE_STATUS].parseResponse({
        success: true,
        documentId: 'content-document-7',
        enabled: true,
        supported: true,
        surfaceCapabilityToken: 'surface-token-1',
        tabId: 7,
        unsupportedReason: null,
        viewport: null,
      })
    ).toEqual({
      success: true,
      documentId: 'content-document-7',
      enabled: true,
      supported: true,
      surfaceCapabilityToken: 'surface-token-1',
      tabId: 7,
      unsupportedReason: null,
      viewport: null,
    });
  });

  it('validates preset identity, target, dimensions, and availability context', () => {
    expect(
      runtimeModeMessageContracts[MessageType.APPLY_VIEWPORT_PRESET].parseRequest({
        type: MessageType.APPLY_VIEWPORT_PRESET,
        operationGeneration: 1,
        presetId: 'preset-1',
        surfaceCapabilityToken: 'surface-token-1',
      })
    ).toMatchObject({ presetId: 'preset-1' });
    expect(
      runtimeModeMessageContracts[MessageType.GET_VIEWPORT_PRESET_AVAILABILITY].parseRequest({
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        context: 'video',
        presetIds: ['preset-1'],
      })
    ).toMatchObject({ context: 'video' });
    expect(() =>
      runtimeModeMessageContracts[MessageType.GET_VIEWPORT_PRESET_AVAILABILITY].parseRequest({
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        context: 'screen',
        presetIds: ['preset-1'],
      })
    ).toThrow(/GET_VIEWPORT_PRESET_AVAILABILITY/);
  });

  it('narrows every availability response variant exactly at the runtime boundary', () => {
    const contract = runtimeModeMessageContracts[MessageType.GET_VIEWPORT_PRESET_AVAILABILITY];
    const available = {
      status: 'available',
      presetId: 'preset-1',
      target: 'window',
      required: { width: 1280, height: 720 },
    } as const;
    const pending = {
      status: 'requires-start-validation',
      presetId: 'preset-2',
      target: 'viewport',
      required: { width: 1024, height: 768 },
    } as const;
    const unavailable = {
      status: 'unavailable',
      presetId: 'preset-3',
      target: 'viewport',
      reason: 'viewport-too-large',
      required: { width: 1920, height: 1080 },
      available: { width: 1440, height: 900 },
    } as const;

    for (const availability of [available, pending, unavailable]) {
      expect(contract.parseResponse({ success: true, availabilities: [availability] })).toEqual({
        success: true,
        availabilities: [availability],
      });
    }

    for (const availability of [
      { status: 'available' },
      { ...available, target: 'screen' },
      { ...pending, target: 'window' },
      { ...unavailable, reason: 'unknown' },
      { ...available, required: { width: '1280', height: 720 } },
      { ...available, unexpected: true },
    ]) {
      expect(() =>
        contract.parseResponse({ success: true, availabilities: [availability] })
      ).toThrow(/GET_VIEWPORT_PRESET_AVAILABILITY/);
    }
  });

  it('accepts exact applied viewport payloads and rejects malformed targets', () => {
    const viewport = {
      height: 720,
      presetId: 'preset-1',
      target: 'window',
      width: 1280,
    } as const;
    expect(
      runtimeModeMessageContracts[MessageType.SCREENSHOT_MODE_STATUS].parseResponse({
        success: true,
        viewport,
      })
    ).toEqual({ success: true, viewport });
    expect(() =>
      runtimeModeMessageContracts[MessageType.SCREENSHOT_MODE_STATUS].parseResponse({
        success: true,
        viewport: { ...viewport, target: 'screen' },
      })
    ).toThrow(/SCREENSHOT_MODE_STATUS/);
    expect(() =>
      runtimeModeMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE].parseRequest({
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        viewport: { ...viewport, width: '1280' },
      })
    ).toThrow(/ENABLE_SCREENSHOT_MODE/);
  });
});
