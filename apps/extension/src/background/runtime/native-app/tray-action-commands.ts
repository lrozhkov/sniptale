import type {
  NativeCaptureMode,
  NativeRecordingMode,
  NativeTrayActionKind,
} from '../../../contracts/native-app';
import type { NativeTrayActionKey } from '@sniptale/runtime-contracts/video/types/types';

export type NativeTrayActionCommand =
  | { id: string; kind: 'capture-screenshot'; mode: NativeCaptureMode }
  | { id: string; kind: 'start-recording'; mode: NativeRecordingMode }
  | { id: string; kind: Exclude<NativeTrayActionKind, 'capture-screenshot' | 'start-recording'> };

export const nativeTrayActionCommands = {
  captureAllScreensScreenshot: {
    id: 'capture-screenshot-all-screens',
    kind: 'capture-screenshot',
    mode: 'all-screens',
  },
  captureRegionScreenshot: {
    id: 'capture-screenshot-region',
    kind: 'capture-screenshot',
    mode: 'region',
  },
  captureScreenScreenshot: {
    id: 'capture-screenshot-screen',
    kind: 'capture-screenshot',
    mode: 'screen',
  },
  captureWindowScreenshot: {
    id: 'capture-screenshot-active-window',
    kind: 'capture-screenshot',
    mode: 'active-window',
  },
  openGallery: { id: 'open-gallery', kind: 'open-gallery' },
  openSettings: { id: 'open-settings', kind: 'open-settings' },
  openVideoEditor: { id: 'open-video-editor', kind: 'open-video-editor' },
  pauseRecording: { id: 'pause-recording', kind: 'pause-recording' },
  resumeRecording: { id: 'resume-recording', kind: 'resume-recording' },
  startRegionRecording: {
    id: 'start-recording-region',
    kind: 'start-recording',
    mode: 'region',
  },
  startScreenRecording: {
    id: 'start-recording-screen',
    kind: 'start-recording',
    mode: 'screen',
  },
  startWindowRecording: {
    id: 'start-recording-active-window',
    kind: 'start-recording',
    mode: 'active-window',
  },
  stopRecording: { id: 'stop-recording', kind: 'stop-recording' },
} satisfies Record<NativeTrayActionKey, NativeTrayActionCommand>;
