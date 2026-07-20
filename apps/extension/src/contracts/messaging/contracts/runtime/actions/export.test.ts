/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from './export';

describe('runtimeActionExportMessageContracts', () => {
  const capability = {
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'route-req-1',
  };

  it('parses export-start and export-stop runtime messages', () => {
    expect(
      runtimeActionExportMessageContracts[
        MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY
      ].parseRequest({
        sessionId: 'session',
        type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
      })
    ).toEqual({ sessionId: 'session', type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY });
    expect(
      runtimeActionExportMessageContracts[
        MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY
      ].parseRequest({
        rawDiagnosticsEnabled: true,
        sessionId: 'session',
        type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
      })
    ).toEqual({
      rawDiagnosticsEnabled: true,
      sessionId: 'session',
      type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
    });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_START_HAR].parseRequest({
        capabilityToken: 'start-token',
        sessionId: 'session',
        type: MessageType.EXPORT_START_HAR,
      })
    ).toEqual({
      capabilityToken: 'start-token',
      sessionId: 'session',
      type: MessageType.EXPORT_START_HAR,
    });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_START_HAR].parseResponse({
        capabilityToken: 'har-token',
        expiresAtEpochMs: 123,
        success: true,
      })
    ).toEqual({ capabilityToken: 'har-token', expiresAtEpochMs: 123, success: true });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseRequest({
        capabilityToken: 'har-token',
        sessionId: 'session',
        type: MessageType.EXPORT_STOP_HAR,
      })
    ).toEqual({
      capabilityToken: 'har-token',
      sessionId: 'session',
      type: MessageType.EXPORT_STOP_HAR,
    });

    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseResponse({ har: {} })
    ).toEqual({ har: {} });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseResponse({
        har: {},
        rawDiagnosticsEnabled: true,
      })
    ).toEqual({ har: {}, rawDiagnosticsEnabled: true });
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseResponse({
        har: 'raw-har',
      })
    ).toThrow();
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseResponse({
        har: null,
      })
    ).toThrow();
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseResponse({
        har: [],
      })
    ).toThrow();
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_START_HAR].parseRequest({
        rawDiagnosticsEnabled: true,
        sessionId: 'session',
        type: MessageType.EXPORT_START_HAR,
      })
    ).toThrow();
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_STOP_HAR].parseRequest({
        sessionId: 'session',
        type: MessageType.EXPORT_STOP_HAR,
      })
    ).toThrow();
  });

  it('parses popup export progress and result payloads', () => {
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_PROGRESS].parseRequest({
        progress: {
          activeStepKey: 'json',
          current: 1,
          errors: [],
          message: 'Exporting',
          phase: 'running',
          total: 2,
        },
        requestId: 'req',
        type: MessageType.EXPORT_POPUP_PROGRESS,
      })
    ).toEqual(
      expect.objectContaining({ requestId: 'req', type: MessageType.EXPORT_POPUP_PROGRESS })
    );

    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_RESULT].parseRequest({
        requestId: 'req',
        result: {
          errors: [],
          filename: 'export.zip',
          stats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 3 },
          success: true,
        },
        type: MessageType.EXPORT_POPUP_RESULT,
      })
    ).toEqual(expect.objectContaining({ requestId: 'req' }));
  });

  it('parses viewer-routed popup export runtime requests', () => {
    const options = {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includeHarDomLogs: false,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
    };

    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_START].parseRequest({
        ...capability,
        options,
        requestId: 'req',
        tabId: 7,
        type: MessageType.EXPORT_POPUP_START,
      })
    ).toEqual({
      ...capability,
      options,
      requestId: 'req',
      tabId: 7,
      type: MessageType.EXPORT_POPUP_START,
    });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT].parseRequest({
        ...capability,
        requestId: 'req-web',
        tabId: 7,
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      })
    ).toEqual({
      ...capability,
      requestId: 'req-web',
      tabId: 7,
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    });
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT].parseRequest({
        allowAuthenticatedSameOriginAssets: false,
        ...capability,
        requestId: 'req-web',
        tabId: 7,
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      })
    ).toThrow();
    expect(() =>
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_PREVIEW].parseRequest({
        tabId: 7,
        type: MessageType.EXPORT_POPUP_PREVIEW,
      })
    ).toThrow();
    expect(
      runtimeActionExportMessageContracts[
        MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY
      ].parseRequest({
        operation: MessageType.EXPORT_POPUP_PREVIEW,
        requestId: 'route-req-1',
        tabId: 7,
        type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
      })
    ).toEqual({
      operation: MessageType.EXPORT_POPUP_PREVIEW,
      requestId: 'route-req-1',
      tabId: 7,
      type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
    });
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_PREVIEW].parseResponse({
        preview: {
          context: 'example.test',
          jsonPreview: '{}',
          markdownPreview: '# Example',
          rowsCount: 0,
          sectionsCount: 0,
          title: 'Example',
        },
        success: true,
      })
    ).toEqual(expect.objectContaining({ success: true }));
    expect(
      runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT].parseResponse(
        {
          assetId: 'snapshot-1',
          success: true,
          warnings: ['Asset skipped'],
        }
      )
    ).toEqual({
      assetId: 'snapshot-1',
      success: true,
      warnings: ['Asset skipped'],
    });
  });
});
