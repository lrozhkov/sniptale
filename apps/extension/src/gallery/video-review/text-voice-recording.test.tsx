// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextVoiceRecording } from './text-voice-recording';
import { useReviewTextVoiceOperation, type ReviewTextVoiceAccess } from './use-text-voice';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import { parseReviewOperation } from '../../features/video/review/validation';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';

const io = vi.hoisted(() => ({ acquire: vi.fn(), prepared: vi.fn(), event: vi.fn() }));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: io.prepared }));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: io.event }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
let created: number;
let stopped: ReturnType<typeof vi.fn>;

function fixture(beforeRequest = vi.fn(async () => undefined)) {
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    text: 'Human narration',
    start: 1,
    end: 2,
    timeDomain: 'result',
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  let saved: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const commit = vi.fn(
    async (
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['commitVideoWorkspace']
      >[0]
    ) => {
      const operation = parseReviewOperation(args.operation, 10);
      if (!operation) throw new Error('invalid');
      saved = {
        ...saved,
        workspace: {
          ...saved.workspace,
          revision: saved.workspace.revision + 1,
          history: [...saved.workspace.history, operation],
          cursor: saved.workspace.cursor + 1,
        },
      };
      return structuredClone(saved);
    }
  );
  const session = createVideoReviewSession(saved, {
    commitVideoWorkspace: commit,
    readVideoWorkspace: vi.fn(async () => structuredClone(saved)),
    saveVideoWorkspaceSnapshot: vi.fn(),
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
  });
  const failure = vi.fn();
  const guard = createReviewSpeechEditGuard(failure);
  const video = {
    current: {
      currentTime: 0,
      duration: 10,
      ended: false,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement,
  };
  const silent = vi.fn();
  const access: ReviewTextVoiceAccess = {
    session,
    beforeRequest,
    context: {
      video,
      registerPending: guard.register,
      beforeAction: (action) => {
        void guard.perform(action);
      },
      setSilent: silent,
    },
  };
  const Harness = () => {
    const operation = useReviewTextVoiceOperation({ access, ids: ['text'] });
    return <ReviewTextVoiceRecording access={access} fragmentId="text" operation={operation} />;
  };
  return { session, commit, guard, failure, video, silent, beforeRequest, Harness };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: io.acquire, enumerateDevices: async () => [] },
  });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  vi.stubGlobal(
    'AudioContext',
    class {
      async decodeAudioData() {
        return {
          duration: 2,
          length: 16,
          sampleRate: 8,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(16),
        };
      }
      async close() {}
    }
  );
  created = 0;
  stopped = vi.fn();
  io.acquire.mockResolvedValue({ getTracks: () => [{ stop: stopped }] });
  io.prepared.mockResolvedValue({
    id: 'human',
    protect: vi.fn(),
    cancel: vi.fn(),
    publish: vi.fn(),
  });
  vi.stubGlobal(
    'MediaRecorder',
    class extends EventTarget {
      static isTypeSupported = () => true;
      state = 'inactive';
      mimeType = 'audio/webm';
      constructor() {
        super();
        created += 1;
      }
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
        const data = new Event('dataavailable');
        Object.defineProperty(data, 'data', { value: new Blob(['voice']) });
        this.dispatchEvent(data);
        this.dispatchEvent(new Event('stop'));
      }
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(candidate: ReturnType<typeof fixture>) {
  await act(async () => root.render(<candidate.Harness />));
}
async function click(key: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.getAttribute('aria-label') === key || element.textContent?.includes(key)
  );
  if (!button) throw new Error(`Missing ${key}`);
  await act(async () => button.click());
}
async function record() {
  await click('videoEditor.app.recordAudioStart');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await click('videoEditor.app.recordAudioStop');
}

it('records inline, pauses/resumes, applies one ordinary human take, and rearms on the next Start', async () => {
  const candidate = fixture();
  await render(candidate);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.max).toBe('9');
  await click('videoEditor.app.recordAudioStart');
  expect(candidate.video.current.currentTime).toBe(1);
  await click('videoEditor.app.recordAudioPause');
  await click('videoEditor.app.recordAudioResume');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await click('videoEditor.app.recordAudioStop');
  await click('gallery.videoReview.textVoiceLocalSave');
  expect(candidate.session.getSnapshot().document.advancedContent.audio.voiceover[0]).toMatchObject(
    {
      assetId: 'project-asset:human',
      textSnapshot: { kind: 'microphone', text: 'Human narration' },
    }
  );
  expect(candidate.commit).toHaveBeenCalledOnce();
  await click('videoEditor.app.recordAudioStart');
  expect(created).toBe(2);
  expect(io.acquire).toHaveBeenCalledTimes(2);
});

it('keeps the human take on publication failure and retries its receipt without another durable clip', async () => {
  const publish = vi
    .fn()
    .mockRejectedValueOnce(new Error('publication'))
    .mockResolvedValue(undefined);
  const cancel = vi.fn();
  io.prepared.mockResolvedValue({ id: 'human', protect: vi.fn(), cancel, publish });
  const candidate = fixture();
  await render(candidate);
  await record();
  await click('gallery.videoReview.textVoiceLocalSave');
  expect(candidate.commit).toHaveBeenCalledOnce();
  expect(candidate.session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).toContain('gallery.videoReview.textVoiceLocalSave');
  await click('gallery.videoReview.textVoiceLocalSave');
  expect(publish).toHaveBeenCalledTimes(2);
  expect(io.prepared).toHaveBeenCalledOnce();
  expect(candidate.commit).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('gallery.videoReview.textVoiceLocalSave');
  expect(cancel).not.toHaveBeenCalled();
});

it('keeps a declined restart and acquires exactly once after confirmed discard', async () => {
  const candidate = fixture();
  await render(candidate);
  await record();
  await click('videoEditor.app.recordAudioAgain');
  await click('videoEditor.app.recordAudioKeep');
  expect(created).toBe(1);
  expect(host.textContent).toContain('gallery.videoReview.textVoiceLocalSave');
  await click('videoEditor.app.recordAudioAgain');
  await click('videoEditor.app.recordAudioDiscard');
  expect(created).toBe(2);
  expect(io.acquire).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await click('videoEditor.app.recordAudioStop');
  await click('gallery.videoReview.textVoiceLocalSave');
  expect(candidate.commit).toHaveBeenCalledOnce();
});

it('declines discard without leaving, then releases capture before a guarded lane Mic continuation', async () => {
  const candidate = fixture();
  await render(candidate);
  await record();
  const action = vi.fn(() => candidate.silent(true));
  let pending: ReturnType<typeof candidate.guard.perform>;
  await act(async () => {
    pending = candidate.guard.perform(action);
  });
  await click('videoEditor.app.recordAudioKeep');
  await act(async () => {
    await pending;
  });
  expect(action).not.toHaveBeenCalled();
  expect(candidate.failure).not.toHaveBeenCalled();
  await act(async () => {
    pending = candidate.guard.perform(action);
  });
  await click('videoEditor.app.recordAudioDiscard');
  await act(async () => {
    await pending;
  });
  expect(action).toHaveBeenCalledOnce();
  expect(candidate.silent.mock.calls.at(-1)).toEqual([true]);
  const count = candidate.silent.mock.calls.length;
  await act(async () => root.render(null));
  expect(candidate.silent.mock.calls.length).toBe(count);
  expect(stopped).toHaveBeenCalled();
});

it('cancels delayed microphone permission, stops its late stream and starts again in the same view', async () => {
  let resolve!: (stream: unknown) => void;
  io.acquire.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const candidate = fixture();
  await render(candidate);
  await click('videoEditor.app.recordAudioStart');
  const action = vi.fn();
  await act(async () => {
    await candidate.guard.perform(action);
  });
  expect(action).toHaveBeenCalledOnce();
  await act(async () => resolve({ getTracks: () => [{ stop: stopped }] }));
  expect(created).toBe(0);
  expect(stopped).toHaveBeenCalledOnce();
  await click('videoEditor.app.recordAudioStart');
  expect(created).toBe(1);
});

it('does not acquire a microphone after a cancelled editor-buffer join', async () => {
  let resolve!: () => void;
  const joining = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    )
    .mockResolvedValue(undefined);
  const candidate = fixture(joining);
  await render(candidate);
  await click('videoEditor.app.recordAudioStart');
  const action = vi.fn();
  await act(async () => {
    await candidate.guard.perform(action);
  });
  await act(async () => resolve());
  expect(action).toHaveBeenCalledOnce();
  expect(io.acquire).not.toHaveBeenCalled();
  await click('videoEditor.app.recordAudioStart');
  expect(io.acquire).toHaveBeenCalledOnce();
});

it('shows denied permission and keeps setup available for an explicit retry', async () => {
  io.acquire.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  const candidate = fixture();
  await render(candidate);
  await click('videoEditor.app.recordAudioStart');
  expect(host.textContent).toContain('videoEditor.app.recordAudioPermissionDenied');
  await click('videoEditor.app.recordAudioStart');
  expect(created).toBe(1);
});
