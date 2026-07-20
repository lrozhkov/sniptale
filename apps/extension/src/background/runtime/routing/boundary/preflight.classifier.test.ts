import { describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { classifyRuntimeMessageRoute } from './preflight';

vi.mock('../../../capture/page-style-runtime/route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/page-style-runtime/route')>()),
  isPageStyleRuntimeMessage: () => false,
}));

describe('background runtime message preflight classifier', () => {
  it('classifies routes without executing runtime handlers or authorization gates', () => {
    expect(classifyRuntimeMessageRoute({ type: 'KEEP_ALIVE' })).toEqual({
      kind: 'internal-signal',
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.EXPORT_POPUP_RESULT })).toEqual({
      kind: 'internal-signal',
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.EXPORT_POPUP_PROGRESS })).toEqual({
      kind: 'internal-signal',
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.PROCESS_WITH_LLM })).toEqual({
      kind: 'background-owned',
    });
    expect(
      classifyRuntimeMessageRoute({ type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK })
    ).toEqual({
      kind: 'background-owned',
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE })).toEqual({
      kind: 'background-owned',
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE })).toEqual(
      {
        kind: 'background-owned',
      }
    );
    expect(classifyRuntimeMessageRoute({ type: VideoMessageType.GET_RECORDING_STATE })).toEqual({
      kind: 'video-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
    });
    expect(classifyRuntimeMessageRoute({ type: MessageType.ENABLE_SCREENSHOT_MODE })).toEqual({
      kind: 'tab',
      tabMessage: { type: MessageType.ENABLE_SCREENSHOT_MODE },
    });
    expect(classifyRuntimeMessageRoute({ type: 'UNHANDLED_RUNTIME' })).toEqual({
      kind: 'unknown',
    });
  });
});
