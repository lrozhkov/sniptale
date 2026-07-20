import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
  WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
} from './contracts';
import {
  parseViewerExportPortRequest,
  parseViewerExportPortResponse,
  parseViewerPreparationCommand,
} from './port-parsers';

const EXPORT_OPTIONS = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeHarDomLogs: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
};

describe('viewer preparation simple command parser', () => {
  it('parses disable and viewport-only commands', () => {
    expect(parseViewerPreparationCommand({ type: MessageType.DISABLE_SCREENSHOT_MODE })).toEqual({
      type: MessageType.DISABLE_SCREENSHOT_MODE,
    });
    expect(
      parseViewerPreparationCommand({
        type: MessageType.SET_VIEWPORT,
        viewport: null,
      })
    ).toEqual({ type: MessageType.SET_VIEWPORT, viewport: null });
  });
});

describe('viewer preparation enable command parser', () => {
  it('parses screenshot mode commands from unknown port payloads', () => {
    expect(
      parseViewerPreparationCommand({
        autoStartCaptureType: 'visible',
        autoStartSelection: true,
        quickActionOverlay: {
          afterCapture: 'edit',
          delaySeconds: 3,
          exitAfterCapture: false,
          imageFormat: 'png',
          imageQuality: 90,
        },
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        viewport: { height: 720, width: 1280 },
      })
    ).toEqual({
      autoStartCaptureType: 'visible',
      autoStartSelection: true,
      quickActionOverlay: {
        afterCapture: 'edit',
        delaySeconds: 3,
        exitAfterCapture: false,
        imageFormat: 'png',
        imageQuality: 90,
      },
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: { height: 720, width: 1280 },
    });
  });
});

describe('viewer preparation command rejection parser', () => {
  it('rejects malformed screenshot mode command payloads', () => {
    expect(
      parseViewerPreparationCommand({
        type: MessageType.SET_VIEWPORT,
        viewport: { height: 720, width: '1280' },
      })
    ).toBeNull();
    expect(
      parseViewerPreparationCommand({
        autoStartCaptureType: 'selection',
        type: MessageType.ENABLE_SCREENSHOT_MODE,
      })
    ).toBeNull();
  });
});

describe('viewer export simple request parser', () => {
  it('parses simple popup export request variants', () => {
    expect(
      parseViewerExportPortRequest({
        request: { type: MessageType.EXPORT_POPUP_PREVIEW },
        requestId: 'port-preview',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })
    ).toEqual({
      request: { type: MessageType.EXPORT_POPUP_PREVIEW },
      requestId: 'port-preview',
      type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
      viewerPortGeneration: 'viewer-generation-1',
    });
    expect(
      parseViewerExportPortRequest({
        request: { type: MessageType.EXPORT_POPUP_CANCEL },
        requestId: 'port-cancel',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })
    ).toEqual({
      request: { type: MessageType.EXPORT_POPUP_CANCEL },
      requestId: 'port-cancel',
      type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
      viewerPortGeneration: 'viewer-generation-1',
    });
  });
});

describe('viewer export correlated response parser', () => {
  it('parses popup export requests and correlated responses', () => {
    expect(
      parseViewerExportPortRequest({
        request: {
          options: EXPORT_OPTIONS,
          requestId: 'export-1',
          type: MessageType.EXPORT_POPUP_START,
        },
        requestId: 'port-1',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })
    ).toEqual({
      request: {
        options: EXPORT_OPTIONS,
        requestId: 'export-1',
        type: MessageType.EXPORT_POPUP_START,
      },
      requestId: 'port-1',
      type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
      viewerPortGeneration: 'viewer-generation-1',
    });

    const response = parseViewerExportPortResponse(
      {
        requestId: 'port-1',
        response: { success: true },
        type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
        viewerPortGeneration: 'viewer-generation-1',
      },
      'port-1'
    );

    expect(response).not.toBeNull();
    expect(response?.response).toEqual({
      success: true,
    });
  });
});

describe('viewer export package request parser', () => {
  it('parses web snapshot save and package export request variants', () => {
    expect(
      parseViewerExportPortRequest({
        request: {
          requestId: 'save-1',
          type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
        },
        requestId: 'port-save',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })?.request
    ).toEqual({
      requestId: 'save-1',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    });
    expect(
      parseViewerExportPortRequest({
        request: {
          options: EXPORT_OPTIONS,
          type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        },
        requestId: 'port-package',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })?.request
    ).toEqual({
      options: EXPORT_OPTIONS,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    });
  });
});

describe('viewer export port parser rejection cases', () => {
  it('rejects malformed export envelopes and mismatched responses', () => {
    expect(
      parseViewerExportPortRequest({
        request: { options: { includeJson: true }, type: MessageType.EXPORT_POPUP_START },
        requestId: 'port-1',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
        viewerPortGeneration: 'viewer-generation-1',
      })
    ).toBeNull();
    expect(
      parseViewerExportPortRequest({
        request: { type: MessageType.EXPORT_POPUP_CANCEL },
        requestId: 'port-1',
        type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
      })
    ).toBeNull();
    expect(
      parseViewerExportPortResponse(
        {
          requestId: 'other-port',
          response: { success: true },
          type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
          viewerPortGeneration: 'viewer-generation-1',
        },
        'port-1'
      )
    ).toBeNull();
    expect(
      parseViewerExportPortResponse(
        {
          requestId: 'port-1',
          response: 'not-an-object',
          type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
          viewerPortGeneration: 'viewer-generation-1',
        },
        'port-1'
      )
    ).toBeNull();
  });
});
