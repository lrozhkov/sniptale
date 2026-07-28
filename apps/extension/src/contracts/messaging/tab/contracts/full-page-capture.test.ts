import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabFullPageCaptureMessageContracts } from './full-page-capture';
import { tabUiExportMessageContracts } from './ui-export';
import { tabWebSnapshotMessageContracts } from './web-snapshot';

const identity = {
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'generation-1',
};

const geometry = {
  devicePixelRatio: 1,
  extentHeight: 1_200,
  extentWidth: 800,
  outputHeight: 1_200,
  outputWidth: 800,
  rootKind: 'document' as const,
  rootViewport: { height: 600, width: 800, x: 0, y: 0 },
  viewportHeight: 600,
  viewportWidth: 800,
};

it('parses exact page-agent session, tile, and restore messages', () => {
  expect(
    tabFullPageCaptureMessageContracts[MessageType.HEARTBEAT_FULL_PAGE_CAPTURE].parseRequest({
      ...identity,
      type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE,
    })
  ).toEqual(expect.objectContaining(identity));

  expect(
    tabFullPageCaptureMessageContracts[MessageType.PREPARE_FULL_PAGE_CAPTURE].parseRequest({
      ...identity,
      preferences: { floatingElements: 'once', freezeMotion: true, preloadLazyContent: true },
      type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
    })
  ).toEqual(expect.objectContaining(identity));

  expect(
    tabFullPageCaptureMessageContracts[MessageType.PREPARE_FULL_PAGE_TILE].parseRequest({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: false,
      lastRow: false,
      row: 0,
      targetX: 0,
      targetY: 0,
      type: MessageType.PREPARE_FULL_PAGE_TILE,
    })
  ).toEqual(expect.objectContaining({ column: 0, targetY: 0 }));

  expect(
    tabFullPageCaptureMessageContracts[MessageType.RESTORE_FULL_PAGE_CAPTURE].parseRequest({
      ...identity,
      type: MessageType.RESTORE_FULL_PAGE_CAPTURE,
    })
  ).toEqual(expect.objectContaining(identity));
});

it('rejects malformed identities, preferences, geometry, and negative tile offsets', () => {
  expect(() =>
    tabFullPageCaptureMessageContracts[MessageType.PREPARE_FULL_PAGE_CAPTURE].parseRequest({
      ...identity,
      ownerToken: 7,
      preferences: { floatingElements: 'repeat', freezeMotion: true, preloadLazyContent: true },
      type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
    })
  ).toThrow();
  expect(() =>
    tabFullPageCaptureMessageContracts[MessageType.PREPARE_FULL_PAGE_CAPTURE].parseRequest({
      ...identity,
      preferences: { floatingElements: 'all', freezeMotion: true, preloadLazyContent: true },
      type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
    })
  ).toThrow();
  expect(() =>
    tabFullPageCaptureMessageContracts[MessageType.PREPARE_FULL_PAGE_TILE].parseRequest({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: -1,
      targetY: 0,
      type: MessageType.PREPARE_FULL_PAGE_TILE,
    })
  ).toThrow();
  expect(() =>
    tabFullPageCaptureMessageContracts[MessageType.VERIFY_FULL_PAGE_TILE].parseResponse({
      result: {
        actualX: 0,
        actualY: 0,
        frozenExtentWarning: false,
        geometry: { ...geometry, extentHeight: Number.POSITIVE_INFINITY },
        layoutGeneration: 'layout-1',
      },
      success: true,
    })
  ).toThrow();
});

it('parses a verified tile state only after checking every DOM-derived field', () => {
  expect(
    tabFullPageCaptureMessageContracts[MessageType.VERIFY_FULL_PAGE_TILE].parseResponse({
      result: {
        actualX: 0,
        actualY: 600,
        frozenExtentWarning: true,
        geometry,
        layoutGeneration: 'layout-1',
      },
      success: true,
    })
  ).toEqual(expect.objectContaining({ success: true }));
});

it('accepts both authorized full-page export actions at popup export boundaries', () => {
  const options = {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: true,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
  for (const fullPageCaptureAction of [
    MessageType.EXPORT_CAPTURE_FULL_PAGE,
    MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED,
  ] as const) {
    expect(
      tabUiExportMessageContracts[MessageType.EXPORT_POPUP_START].parseRequest({
        fullPageCaptureAction,
        options,
        requestId: 'export-run-1',
        type: MessageType.EXPORT_POPUP_START,
      })
    ).toEqual(expect.objectContaining({ fullPageCaptureAction }));
    expect(
      tabWebSnapshotMessageContracts[MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT].parseRequest({
        allowAnonymousCrossOriginAssets: false,
        allowAuthenticatedSameOriginAssets: true,
        fullPageCaptureAction,
        requestId: 'export-run-1',
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      })
    ).toEqual(expect.objectContaining({ fullPageCaptureAction }));
  }
});
