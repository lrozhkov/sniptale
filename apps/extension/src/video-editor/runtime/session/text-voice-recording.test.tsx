// @vitest-environment jsdom
import { act, useState } from 'react';
import { DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES } from '../../../composition/persistence/video-editor-preview-preferences';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  RuntimeProjectContext,
  RuntimePlaybackContext,
  WorkspacePlaybackRangeContext,
  WorkspacePreviewContext,
} from '../controller/composition/contexts';
import { useVideoEditorStore } from '../../state/store';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import { useProjectTextVoiceRecording } from './text-voice-recording';
import { ProjectTextVoiceRecording } from '../../workspace/sidebar/selection/inspection/text-voice-recording';
import { RecordingDiscardConfirmation } from '../../../composition/audio-recording/dialog/dismissal';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type {
  ProjectVoiceTakeAccess,
  ProjectVoiceTakePreview,
} from '../../../workflows/video/project-voice-take';
import { inspectReviewAudio } from '../../../workflows/video-review/audio-import';
import { createTrimmedRecordingFile } from '../../../composition/audio-recording/trim-file';

vi.mock('../../../workflows/video-review/audio-import', () => ({ inspectReviewAudio: vi.fn() }));
vi.mock('../../../composition/audio-recording/trim-file', () => ({
  createTrimmedRecordingFile: vi.fn(),
}));
vi.mock('../../../composition/audio-recording/dialog/waveform', () => ({
  useRecordedAudioPeaks: () => [0.2],
}));
vi.mock('../../../platform/i18n', async (original) => {
  const module = await original<typeof import('../../../platform/i18n')>();
  return { ...module, translate: module.createTranslator('en') };
});
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let recording: ReturnType<typeof useProjectTextVoiceRecording>;
let project: ReturnType<typeof createEmptyVideoProject>;
let access: ProjectVoiceTakeAccess;
let now: number;
let leaveGuard: (() => Promise<boolean>) | null = null;
const setCapturing = vi.fn();
const initialRange = { start: 6, end: 8, loop: true };
let observedRange: VideoEditorPlaybackRange | null;
let replaceRange: (range: VideoEditorPlaybackRange) => void;
const runtime = {
  pausePlayback: vi.fn(() => useVideoEditorStore.getState().currentTime),
  setPlaybackPlaying: vi.fn(async () => true),
  seekTo: vi.fn(),
  stepByFrames: vi.fn(),
  togglePlayback: vi.fn(),
};
const setSourceViewerActive = vi.fn();
const registerLeave = vi.fn((guard: () => Promise<boolean>) => {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
});
const prepared = vi.fn<(preview: ProjectVoiceTakePreview) => boolean>(() => true);
const media = vi.fn();
const stopped = vi.fn();
class Recorder extends EventTarget {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', {
      value: new Blob(['raw take'], { type: this.mimeType }),
    });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}
function Harness({
  view = true,
  parent = true,
  enabled = true,
}: {
  view?: boolean;
  parent?: boolean;
  enabled?: boolean;
}) {
  recording = useProjectTextVoiceRecording({
    access,
    target: { documentId: 'script', fragmentId: 'phrase' },
    enabled,
    accepted: false,
    startTime: 2,
    parentVisible: parent,
    onPrepared: prepared,
  });
  return (
    <InspectorLayout>
      {view ? <ProjectTextVoiceRecording recording={recording} /> : null}
      <RecordingDiscardConfirmation value={recording.confirmation} />
    </InspectorLayout>
  );
}
function PlaybackHarness(props: Parameters<typeof Harness>[0]) {
  const [playbackRange, setPlaybackRange] = useState<VideoEditorPlaybackRange | null>(initialRange);
  observedRange = playbackRange;
  replaceRange = setPlaybackRange;
  return (
    <RuntimePlaybackContext.Provider value={runtime}>
      <WorkspacePlaybackRangeContext.Provider
        value={{
          playbackRange,
          setPlaybackRange,
          clearPlaybackRange: () => setPlaybackRange(null),
        }}
      >
        <WorkspacePreviewContext.Provider
          value={{
            sourceViewerActive: false,
            setSourceViewerActive,
            resetPaneHeight: vi.fn(),
            handleVerticalResizeKeyDown: vi.fn(),
            handleStartVerticalResize: vi.fn(),
            paneHeight: null,
            workspaceSplitRef: { current: null },
            preferences: {
              preferences: DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
              retrySave: vi.fn(),
              saveFailed: false,
              updatePreferences: vi.fn(),
            },
          }}
        >
          <Harness {...props} />
        </WorkspacePreviewContext.Provider>
      </WorkspacePlaybackRangeContext.Provider>
    </RuntimePlaybackContext.Provider>
  );
}
const render = (props: Parameters<typeof Harness>[0] = {}) =>
  act(async () =>
    root.render(
      <RuntimeProjectContext.Provider
        value={{
          applyLoadedProject: vi.fn(),
          recordingLeave: {
            obscured: false,
            register: registerLeave,
            capturing: false,
            setCapturing,
            request: async () => (leaveGuard ? leaveGuard() : true),
          },
        }}
      >
        <PlaybackHarness {...props} />
      </RuntimeProjectContext.Provider>
    )
  );
const button = (name: string) =>
  [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === name || item.getAttribute('aria-label') === name
  )!;
const settle = (check: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {});
    check();
  });
const start = async (wait = true) => {
  await act(async () => button('Start recording').click());
  if (wait) await settle(() => expect(recording.session.starting).toBe(false));
};
const next = async () => {
  await act(async () => button('Next').click());
  await settle(() => expect(recording.session.isSaving).toBe(false));
};
const stop = () =>
  act(() => {
    now += 4000;
    button('Stop').click();
  });
beforeEach(() => {
  vi.resetAllMocks();
  now = 0;
  runtime.setPlaybackPlaying.mockResolvedValue(true);
  useVideoEditorStore.setState({ currentTime: 0 });
  leaveGuard = null;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  media.mockResolvedValue({ getTracks: () => [{ stop: stopped }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: media },
  });
  vi.mocked(createTrimmedRecordingFile).mockResolvedValue(
    new File(['trim'], 'take.wav', { type: 'audio/wav' })
  );
  vi.mocked(inspectReviewAudio).mockResolvedValue(4);
  prepared.mockReturnValue(true);
  project = createEmptyVideoProject('Capture');
  project.version = 5;
  project.duration = 12;
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Original spoken text',
            originalText: '',
            revision: 1,
            timingRevision: 1,
            start: 0,
            end: 1,
            timeDomain: 'result',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  useVideoEditorStore.setState({ project, currentTime: 0 });
  access = { getProject: () => project, save: vi.fn(async () => {}), update: vi.fn() };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('records, hides and pauses without losing its take, then prepares without a writer', async () => {
  await render();
  await start();
  expect(recording.session.controller.transport.status).toBe('recording');
  await render({ view: false });
  expect(recording.session.controller.transport.status).toBe('paused');
  await render();
  expect(recording.session.controller.transport.status).toBe('paused');
  await act(async () => recording.session.controller.transport.resumeRecording());
  await render({ parent: false });
  expect(recording.session.controller.transport.status).toBe('paused');
  await render();
  expect(recording.session.controller.transport.status).toBe('paused');
  await act(async () => recording.session.controller.transport.resumeRecording());
  stop();
  const raw = recording.session.controller.save.audioBlob;
  expect(raw).not.toBeNull();
  await render({ parent: false });
  await render();
  expect(recording.session.controller.save.audioBlob).toBe(raw);
  await next();
  expect(prepared).toHaveBeenCalledOnce();
  expect(recording.session.controller.save.audioBlob).toBe(raw);
  expect(prepared.mock.calls[0]?.[0]).toMatchObject({
    duration: 4,
    textSnapshot: { text: { kind: 'microphone', text: 'Original spoken text' } },
  });
  expect(access.save).not.toHaveBeenCalled();
  expect(access.update).not.toHaveBeenCalled();
});
it('preserves raw bytes and selected trim after text changes and permits explicit discard', async () => {
  await render();
  await start();
  stop();
  act(() => recording.session.controller.trim?.selectRange({ start: 1, end: 3 }));
  const raw = recording.session.controller.save.audioBlob;
  project.textDocuments![0]!.document.fragments[0]!.text = 'Changed';
  await next();
  expect(prepared).not.toHaveBeenCalled();
  expect(inspectReviewAudio).not.toHaveBeenCalled();
  expect(recording.session.saveError).not.toBeNull();
  expect(recording.session.controller.save.audioBlob).toBe(raw);
  expect(recording.session.controller.save.trimStart).toBe(1);
  const leave = vi.fn();
  act(() => recording.dismiss(leave));
  expect(recording.confirmation.open).toBe(true);
  act(() => recording.confirmation.cancel());
  expect(leave).not.toHaveBeenCalled();
  expect(recording.session.controller.save.audioBlob).toBe(raw);
  act(() => recording.dismiss(leave));
  act(() => recording.confirmation.confirm());
  expect(leave).toHaveBeenCalledOnce();
  expect(recording.session.controller.save.audioBlob).toBeNull();
});
it('refuses a late microphone permission result while hidden and stops its stream', async () => {
  let allow!: (stream: { getTracks(): { stop(): void }[] }) => void;
  media.mockReturnValueOnce(
    new Promise((resolve) => {
      allow = resolve;
    })
  );
  await render();
  await start(false);
  await render({ view: false });
  await act(async () => allow({ getTracks: () => [{ stop: stopped }] }));
  expect(recording.session.controller.transport.status).toBe('idle');
  expect(stopped).toHaveBeenCalledOnce();
  expect(prepared).not.toHaveBeenCalled();
});
it('cancels pending permission on dismissal and ignores the late stream', async () => {
  let allow!: (stream: { getTracks(): { stop(): void }[] }) => void;
  media.mockReturnValueOnce(
    new Promise((resolve) => {
      allow = resolve;
    })
  );
  await render();
  await start(false);
  const leave = vi.fn();
  act(() => recording.dismiss(leave));
  expect(leave).toHaveBeenCalledOnce();
  await act(async () => allow({ getTracks: () => [{ stop: stopped }] }));
  expect(stopped).toHaveBeenCalledOnce();
  expect(recording.session.controller.transport.status).toBe('idle');
});
it('keeps permission failure visible and protects an unfinished take from page closure', async () => {
  media.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  await render();
  await start();
  expect(recording.session.controller.transport.error).toBeTruthy();
  await start();
  stop();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it('admits project navigation through discard and can record again if navigation later fails', async () => {
  await render();
  await start();
  stop();
  expect(setCapturing).toHaveBeenCalledWith(true);
  const raw = recording.session.controller.save.audioBlob;
  let pending!: Promise<boolean>;
  act(() => {
    pending = leaveGuard!();
  });
  expect(recording.confirmation.open).toBe(true);
  act(() => recording.confirmation.cancel());
  await expect(pending).resolves.toBe(false);
  expect(recording.session.controller.save.audioBlob).toBe(raw);
  act(() => {
    pending = leaveGuard!();
  });
  await act(async () => recording.confirmation.confirm());
  await expect(pending).resolves.toBe(true);
  await expect(leaveGuard!()).resolves.toBe(true);
  await start();
  expect(recording.session.controller.transport.status).toBe('recording');
});

it('cancels a pending leave continuation on unmount and ignores late encoding', async () => {
  await render();
  await start();
  stop();
  let pending!: Promise<boolean>;
  act(() => {
    pending = leaveGuard!();
  });
  act(() => root.unmount());
  root = createRoot(host);
  await expect(pending).resolves.toBe(false);
  await render();
  await start();
  stop();
  let finish!: (file: File) => void;
  vi.mocked(createTrimmedRecordingFile).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => {
    button('Next').click();
  });
  await expect(leaveGuard!()).resolves.toBe(false);
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => finish(new File(['late'], 'late.wav', { type: 'audio/wav' })));
  expect(inspectReviewAudio).not.toHaveBeenCalled();
  expect(prepared).not.toHaveBeenCalled();
});

it('uses the compact duration switch and keeps the valid capture cap when toggled off and on', async () => {
  await render();
  const toggle = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
    (item) => item.getAttribute('aria-label') === 'Limit duration'
  )!;
  const number = () => host.querySelector<HTMLInputElement>('input[aria-label="Maximum"]');
  expect(number()?.value).toBe('60');
  act(() => toggle.click());
  expect(recording.durationLimit.enabled).toBe(false);
  expect(number()).toBeNull();
  act(() => toggle.click());
  expect(recording.durationLimit.enabled).toBe(true);
  expect(number()?.value).toBe('60');
});

it('plays from the selected position without looping and restores the prior range after Stop', async () => {
  await render();
  await start();
  expect(runtime.setPlaybackPlaying).toHaveBeenCalledWith(true);
  expect(useVideoEditorStore.getState().currentTime).toBe(2);
  expect(observedRange).toEqual({ start: 2, end: 12, loop: false });
  expect(setSourceViewerActive).toHaveBeenCalledWith(false);
  act(() => useVideoEditorStore.setState({ currentTime: 4 }));
  act(() => recording.session.controller.transport.pauseRecording());
  await act(async () => recording.session.controller.transport.resumeRecording());
  expect(useVideoEditorStore.getState().currentTime).toBe(4);
  expect(observedRange).toEqual({ start: 2, end: 12, loop: false });
  stop();
  expect(observedRange).toBe(initialRange);
  expect(recording.session.controller.save.audioBlob).not.toBeNull();
});

it('records with video off and keeps video stopped after the scene ends', async () => {
  await render();
  act(() => recording.setPlayVideo(false));
  await start();
  expect(runtime.setPlaybackPlaying).not.toHaveBeenCalled();
  expect(recording.session.controller.transport.status).toBe('recording');
  stop();
  act(() => recording.setPlayVideo(true));
  act(() => recording.session.startRecording());
  act(() => recording.confirmation.confirm());
  await settle(() => expect(recording.session.starting).toBe(false));
  act(() => {
    useVideoEditorStore.setState({ currentTime: 12 });
    recording.session.controller.transport.pauseRecording();
  });
  runtime.setPlaybackPlaying.mockClear();
  await act(async () => recording.session.controller.transport.resumeRecording());
  expect(runtime.setPlaybackPlaying).not.toHaveBeenCalled();
  expect(recording.session.controller.transport.status).toBe('recording');
});

it('rejects hidden pending preview preparation without starting capture and restores the previous range', async () => {
  let ready!: (started: boolean) => void;
  runtime.setPlaybackPlaying.mockReturnValueOnce(
    new Promise((resolve) => {
      ready = resolve;
    })
  );
  await render();
  await start(false);
  await settle(() => expect(runtime.setPlaybackPlaying).toHaveBeenCalled());
  await render({ view: false });
  await act(async () => ready(true));
  await settle(() => expect(recording.session.starting).toBe(false));
  expect(recording.session.controller.transport.status).toBe('idle');
  expect(observedRange).toBe(initialRange);
  expect(stopped).toHaveBeenCalledOnce();
});

it('releases the microphone and range after playback refusal and permits retry', async () => {
  runtime.setPlaybackPlaying.mockResolvedValueOnce(false);
  await render();
  await start();
  expect(recording.session.controller.transport.status).toBe('idle');
  expect(recording.session.controller.transport.error).toBeTruthy();
  expect(observedRange).toBe(initialRange);
  expect(stopped).toHaveBeenCalledOnce();
  await start();
  expect(recording.session.controller.transport.status).toBe('recording');
  await render({ enabled: false });
  expect(observedRange).toBe(initialRange);
});

it('preserves a range changed outside the recorder and does not resume into a foreign loop', async () => {
  await render();
  await start();
  const nextRange = { start: 3, end: 5, loop: true };
  act(() => {
    recording.session.controller.transport.pauseRecording();
    replaceRange(nextRange);
  });
  runtime.setPlaybackPlaying.mockClear();
  await act(async () => recording.session.controller.transport.resumeRecording());
  expect(runtime.setPlaybackPlaying).not.toHaveBeenCalled();
  expect(recording.session.controller.transport.status).toBe('paused');
  stop();
  expect(observedRange).toBe(nextRange);
});

it('cancels pending preview resume when the inspector hides and keeps the take available', async () => {
  await render();
  await start();
  act(() => recording.session.controller.transport.pauseRecording());
  let ready!: (started: boolean) => void;
  runtime.setPlaybackPlaying.mockReturnValueOnce(
    new Promise((resolve) => {
      ready = resolve;
    })
  );
  let resuming!: Promise<void>;
  act(() => {
    resuming = recording.session.controller.transport.resumeRecording();
  });
  await render({ parent: false });
  await act(async () => {
    ready(true);
    await resuming;
  });
  expect(recording.session.controller.transport.status).toBe('paused');
  await render();
  expect(recording.session.controller.transport.status).toBe('paused');
  stop();
  expect(recording.session.controller.save.audioBlob).not.toBeNull();
  expect(observedRange).toBe(initialRange);
});
