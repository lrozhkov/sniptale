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
    expect(MessageType.ERASE_LOCAL_EXTENSION_DATA).toBe('ERASE_LOCAL_EXTENSION_DATA');
    expect(MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE).toBe(
      'OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE'
    );
    expect(MessageType.START_PAGE_PACKAGE_JOB).toBe('START_PAGE_PACKAGE_JOB');
    expect(MessageType.GET_PAGE_PACKAGE_JOB_STATUS).toBe('GET_PAGE_PACKAGE_JOB_STATUS');
    expect(MessageType.CANCEL_PAGE_PACKAGE_JOB).toBe('CANCEL_PAGE_PACKAGE_JOB');
    expect(MessageType.ACK_PAGE_PACKAGE_JOB_STATUS).toBe('ACK_PAGE_PACKAGE_JOB_STATUS');
    expect(MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE).toBe(
      'OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE'
    );

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
