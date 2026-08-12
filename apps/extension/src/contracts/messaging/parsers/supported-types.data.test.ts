import { expect, it } from 'vitest';

import {
  backgroundRuntimeTypes,
  contentTabTypes,
  offscreenRuntimeTypes,
  popupRuntimeTypes,
} from './supported-types.data.ts';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

function hasBoundaryType(boundary: ReadonlySet<string>, type: string): boolean {
  return boundary.has(type);
}

it('keeps canonical content tab control types in the content boundary', () => {
  expect(hasBoundaryType(contentTabTypes, VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER)).toBe(true);
  expect(hasBoundaryType(contentTabTypes, VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER)).toBe(true);
  expect(hasBoundaryType(contentTabTypes, MessageType.EXPORT_POPUP_BUILD_PACKAGE)).toBe(true);
});

it('routes recording state sync to the content tab boundary without exposing offscreen events', () => {
  expect(hasBoundaryType(contentTabTypes, VideoMessageType.RECORDING_STATE_SYNC)).toBe(true);
  expect(hasBoundaryType(contentTabTypes, VideoMessageType.OFFSCREEN_ERROR)).toBe(false);
});

it('limits popup and offscreen boundaries to their dedicated runtime contracts', () => {
  expect(hasBoundaryType(popupRuntimeTypes, VideoMessageType.RECORDING_STATE_SYNC)).toBe(true);
  expect(hasBoundaryType(popupRuntimeTypes, VideoMessageType.VIDEO_SAVED_TO_IDB)).toBe(false);
  expect(hasBoundaryType(popupRuntimeTypes, MessageType.ENABLE_SCREENSHOT_MODE)).toBe(false);
  expect(hasBoundaryType(offscreenRuntimeTypes, VideoMessageType.OFFSCREEN_START_RECORDING)).toBe(
    true
  );
  expect(hasBoundaryType(offscreenRuntimeTypes, VideoMessageType.START_RECORDING)).toBe(false);
});

it('keeps background runtime ownership for capture command messages', () => {
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.ENABLE_SCREENSHOT_MODE)).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.EXPORT_POPUP_START)).toBe(true);
  expect(
    hasBoundaryType(backgroundRuntimeTypes, MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY)
  ).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.EXPORT_POPUP_RESULT)).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.EXPORT_POPUP_PROGRESS)).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.AI_SECRET_UNLOCK)).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, MessageType.ERASE_LOCAL_EXTENSION_DATA)).toBe(
    true
  );
  expect(
    hasBoundaryType(backgroundRuntimeTypes, MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY)
  ).toBe(true);
});

it('keeps background runtime ownership for recording command messages', () => {
  expect(hasBoundaryType(backgroundRuntimeTypes, VideoMessageType.START_RECORDING)).toBe(true);
  expect(hasBoundaryType(backgroundRuntimeTypes, VideoMessageType.CANCEL_RECORDING_START)).toBe(
    true
  );
  expect(hasBoundaryType(backgroundRuntimeTypes, VideoMessageType.UPDATE_SETTINGS)).toBe(true);
  expect(hasBoundaryType(offscreenRuntimeTypes, VideoMessageType.UPDATE_SETTINGS)).toBe(false);
  expect(hasBoundaryType(offscreenRuntimeTypes, VideoMessageType.OFFSCREEN_UPDATE_SETTINGS)).toBe(
    true
  );
  expect(hasBoundaryType(backgroundRuntimeTypes, VideoMessageType.RECORDING_STATE_SYNC)).toBe(
    false
  );
});
