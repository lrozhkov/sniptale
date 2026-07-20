import { describe, expect, it } from 'vitest';

import {
  CaptureMessageType,
  CaptureType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';

describe('shared message contracts', () => {
  it('keeps core message ids stable and unique', () => {
    expect(MessageType.EXECUTE_SAVE).toBe('EXECUTE_SAVE');
    expect(MessageType.PROCESS_WITH_LLM).toBe('PROCESS_WITH_LLM');
    expect(MessageType.SCENARIO_GET_SESSION).toBe('SCENARIO_GET_SESSION');
    expect(MessageType.EXPORT_POPUP_RESULT).toBe('EXPORT_POPUP_RESULT');
    expect(MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY).toBe(
      'GET_PAGE_STYLE_CURRENT_RULE_SUMMARY'
    );
    expect(MessageType.OPEN_PAGE_STYLE_INSPECTOR).toBe('OPEN_PAGE_STYLE_INSPECTOR');
    expect(MessageType.ERASE_LOCAL_EXTENSION_DATA).toBe('ERASE_LOCAL_EXTENSION_DATA');
    expect(MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE).toBe(
      'OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE'
    );
    expect(MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK).toBe('STAGE_POPUP_EXPORT_ARCHIVE_CHUNK');
    expect(MessageType.RELEASE_POPUP_EXPORT_ARCHIVE).toBe('RELEASE_POPUP_EXPORT_ARCHIVE');

    const messageValues = Object.values(MessageType);
    expect(new Set(messageValues).size).toBe(messageValues.length);
  });

  it('keeps capture message and mode ids stable', () => {
    expect(CaptureType.VISIBLE).toBe('visible');
    expect(CaptureType.FULL).toBe('full');
    expect(CaptureMessageType.CAPTURE_VISIBLE).toBe('CAPTURE_VISIBLE');
    expect(CaptureMessageType.CAPTURE_COMPLETE).toBe('CAPTURE_COMPLETE');

    const captureValues = Object.values(CaptureMessageType);
    expect(new Set(captureValues).size).toBe(captureValues.length);
  });
});
