import { harnessReady } from './browser-mocks';
import { recordingContext } from '../../../apps/extension/src/offscreen/recording/context';
import { stageProjectExportInput } from '../../../apps/extension/src/composition/persistence/project-export-inputs';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';

type HarnessMediaRecorderState = 'inactive' | 'recording' | 'paused';

type OffscreenHarnessBridge = {
  reset: () => Promise<void>;
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
  setMediaRecorderState: (state: HarnessMediaRecorderState) => void;
  getMediaRecorderState: () => HarnessMediaRecorderState;
};

declare global {
  interface Window {
    __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
  }
}

class HarnessMediaRecorder {
  state: HarnessMediaRecorderState;

  constructor(state: HarnessMediaRecorderState) {
    this.state = state;
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
  }
}

let harnessMediaRecorder: HarnessMediaRecorder | null = null;

function getRoot() {
  return document.getElementById('root');
}

function setReadyState(ready: boolean) {
  const root = getRoot();
  if (!root) {
    return;
  }

  root.dataset['ui'] = 'offscreen.harness.root';
  root.dataset['state'] = ready ? 'ready' : 'loading';
  root.textContent = ready ? 'Offscreen harness ready' : 'Loading offscreen harness';
}

function resetOffscreenHarnessState() {
  harnessMediaRecorder = null;
  recordingContext.resetRecordingSession();
  recordingContext.durationTracker.reset();
  recordingContext.viewportDrawFrozen = false;
  recordingContext.viewportNavigationEpoch = 0;
  recordingContext.updateViewportPresetCrop = null;
  recordingContext.updateViewportPresetDrawState = null;
}

function setMediaRecorderState(state: HarnessMediaRecorderState) {
  harnessMediaRecorder = new HarnessMediaRecorder(state);
  recordingContext.resetRecordingSession();
  if (state === 'inactive') {
    return;
  }

  recordingContext.beginRecordingSession('recording-e2e-harness');
  recordingContext.activateRecorder(harnessMediaRecorder as unknown as MediaRecorder);
}

window.__sniptaleOffscreenHarness = {
  async reset() {
    await window.__sniptaleHarness?.reset();
    resetOffscreenHarnessState();
  },
  setMediaRecorderState,
  getMediaRecorderState() {
    return harnessMediaRecorder?.state ?? 'inactive';
  },
  stageProjectExportInput,
};

setReadyState(false);

void harnessReady.then(async () => {
  resetOffscreenHarnessState();
  await import('../../../apps/extension/src/offscreen/offscreen');
  setReadyState(true);
});
