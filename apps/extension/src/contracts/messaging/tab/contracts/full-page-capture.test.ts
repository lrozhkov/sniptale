import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabFullPageCaptureMessageContracts } from './full-page-capture';
import { tabUiExportMessageContracts } from './ui-export';

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

it('parses the direct popup launch-intent consume contract narrowly', () => {
  expect(
    tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT].parseRequest({
      type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
    })
  ).toEqual({ type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT });
  expect(
    tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT].parseResponse({
      page: 'export',
      success: true,
    })
  ).toEqual({ page: 'export', success: true });
  expect(
    tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT].parseResponse({
      page: null,
      success: true,
    })
  ).toEqual({ page: null, success: true });
  expect(() =>
    tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT].parseResponse({
      page: 'home',
      success: true,
    })
  ).toThrow();
  expect(() =>
    tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT].parseResponse({
      success: true,
    })
  ).toThrow();
});
