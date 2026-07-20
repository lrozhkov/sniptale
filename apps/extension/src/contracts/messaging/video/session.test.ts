import { expectTypeOf, it } from 'vitest';

import type { RuntimeVideoSessionRequestByType } from './session';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

it('includes the optional cursor capture mode on offscreen recording started requests', () => {
  expectTypeOf<
    RuntimeVideoSessionRequestByType[typeof VideoMessageType.OFFSCREEN_RECORDING_STARTED]
  >().toMatchTypeOf<{
    type: typeof VideoMessageType.OFFSCREEN_RECORDING_STARTED;
    recordingId: string;
    cursorCaptureMode?: 'separate' | 'embedded-fallback';
  }>();
});

it('requires recording ids on offscreen lifecycle and duration requests', () => {
  expectTypeOf<
    RuntimeVideoSessionRequestByType[typeof VideoMessageType.RECORDING_DURATION_UPDATED]
  >().toMatchTypeOf<{
    type: typeof VideoMessageType.RECORDING_DURATION_UPDATED;
    duration: number;
    recordingId: string;
  }>();
  expectTypeOf<
    RuntimeVideoSessionRequestByType[typeof VideoMessageType.OFFSCREEN_RECORDING_PAUSED]
  >().toMatchTypeOf<{
    type: typeof VideoMessageType.OFFSCREEN_RECORDING_PAUSED;
    recordingId: string;
  }>();
  expectTypeOf<
    RuntimeVideoSessionRequestByType[typeof VideoMessageType.OFFSCREEN_RECORDING_RESUMED]
  >().toMatchTypeOf<{
    type: typeof VideoMessageType.OFFSCREEN_RECORDING_RESUMED;
    recordingId: string;
  }>();
});
