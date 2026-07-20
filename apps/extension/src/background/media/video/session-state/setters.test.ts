import { beforeEach, expect, it } from 'vitest';

import { videoManagerSession } from '../manager/session';
import {
  setOpenEditorAfterRecording,
  setVideoRecordingCountdownSessionId,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from './setters';

beforeEach(() => {
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentRecordingId = null;
  videoManagerSession.openEditorAfterRecording = false;
  videoManagerSession.currentCountdownSessionId = null;
});

it('writes countdown, recording, and open-editor flags through the setter facade', () => {
  setVideoRecordingCountdownSessionId('countdown-1');
  setVideoRecordingId('recording-1');
  setOpenEditorAfterRecording(true);
  setVideoRecordingTabId(17);

  expect(videoManagerSession.currentCountdownSessionId).toBe('countdown-1');
  expect(videoManagerSession.currentRecordingId).toBe('recording-1');
  expect(videoManagerSession.openEditorAfterRecording).toBe(true);
  expect(videoManagerSession.recordingTabId).toBe(17);
});
