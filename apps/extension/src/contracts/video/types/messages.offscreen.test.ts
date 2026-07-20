import { expectTypeOf, it } from 'vitest';

import type { OffscreenRecordingStartedMessage } from './messages.offscreen.ts';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

it('exposes the optional cursor capture mode on offscreen recording started messages', () => {
  expectTypeOf<OffscreenRecordingStartedMessage>().toMatchTypeOf<{
    type: typeof VideoMessageType.OFFSCREEN_RECORDING_STARTED;
    recordingId: string;
    cursorCaptureMode?: 'separate' | 'embedded-fallback';
    webcamSettings?: { frameRate?: number; height?: number; width?: number };
  }>();
});
