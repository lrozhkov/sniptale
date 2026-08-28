import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { isTopLevelContentRuntimeMessage, isUiRuntimeBridgeMessage } from './ownership';

describe('runtime-message-listener shared ownership routing', () => {
  it('routes screenshot enable only through the UI listener that acknowledges startup', () => {
    const message = { type: MessageType.ENABLE_SCREENSHOT_MODE };

    expect(isTopLevelContentRuntimeMessage(message)).toBe(false);
    expect(isUiRuntimeBridgeMessage(message)).toBe(true);
  });

  it('keeps top-level-only runtime messages out of the UI bridge', () => {
    expect(isTopLevelContentRuntimeMessage({ type: VideoMessageType.SHOW_REGION_SELECTOR })).toBe(
      true
    );
    expect(isUiRuntimeBridgeMessage({ type: VideoMessageType.SHOW_REGION_SELECTOR })).toBe(false);
  });

  it('routes recording surface snapshots through the always-ready top-level bridge', () => {
    const message = { type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT };

    expect(isTopLevelContentRuntimeMessage(message)).toBe(true);
    expect(isUiRuntimeBridgeMessage(message)).toBe(false);
  });

  it('routes recording lifecycle sync through the always-ready top-level bridge', () => {
    const message = { type: VideoMessageType.RECORDING_STATE_SYNC };
    expect(isTopLevelContentRuntimeMessage(message)).toBe(true);
    expect(isUiRuntimeBridgeMessage(message)).toBe(false);
  });

  it('keeps UI-only runtime messages out of the top-level content bridge', () => {
    expect(isUiRuntimeBridgeMessage({ type: MessageType.SHOW_TOOLBAR })).toBe(true);
    expect(isTopLevelContentRuntimeMessage({ type: MessageType.SHOW_TOOLBAR })).toBe(false);
  });
});

describe('runtime-message-listener specialized routing', () => {
  it('routes canonical diagnostic logger messages only through the UI bridge', () => {
    expect(isUiRuntimeBridgeMessage({ type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER })).toBe(
      true
    );
    expect(
      isTopLevelContentRuntimeMessage({ type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER })
    ).toBe(false);
  });

  it('rejects unsupported raw runtime types for both listeners', () => {
    expect(isTopLevelContentRuntimeMessage({ type: 'UNKNOWN_MESSAGE' })).toBe(false);
    expect(isUiRuntimeBridgeMessage({ type: 'UNKNOWN_MESSAGE' })).toBe(false);
    expect(isTopLevelContentRuntimeMessage({})).toBe(false);
    expect(isUiRuntimeBridgeMessage(null)).toBe(false);
  });
});
