// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewMusicImport, reviewMusicPlacement } from './music-import';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { importedAudioClip } from '../../workflows/video-review/audio-import';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';

const io = vi.hoisted(() => ({
  read: vi.fn(),
  binding: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  prepare: vi.fn(),
  inspect: vi.fn(),
  saved: vi.fn(),
}));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../composition/persistence/projects/library-asset-binding', () => ({
  readLibraryAudioBindingSource: io.read,
  prepareLibraryAudioBinding: io.binding,
}));
vi.mock('../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: io.saved,
}));
vi.mock('../../composition/persistence/review-workspaces/asset-refs', () => ({
  reviewWorkspaceHasAudioClip: (
    workspace: { advanced: QuickEditAdvancedContent },
    clipId: string,
    assetId: string
  ) =>
    [...workspace.advanced.audio.music, ...workspace.advanced.audio.voiceover].some(
      (clip) => clip.id === clipId && clip.assetId === assetId
    ),
}));
vi.mock('../../composition/persistence/projects/voiceover-publication-lock', () => ({
  withVoiceoverAttachmentLock: (_id: string, work: () => Promise<unknown>) => work(),
}));
vi.mock('../../workflows/video-review/audio-import', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/audio-import')>()),
  prepareReviewAudio: io.prepare,
  inspectReviewAudio: io.inspect,
}));
let root: Root;
let host: HTMLDivElement;
let api: ReturnType<typeof useReviewMusicImport>;
let state: Parameters<typeof useReviewMusicImport>[0];
let content: QuickEditAdvancedContent;
let persisted: QuickEditAdvancedContent;
let commit: ReturnType<typeof vi.fn>;
let selected: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let audioNodes: Array<{
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
}>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  content = createQuickEditAdvancedState();
  persisted = content;
  selected = vi.fn();
  pause = vi.fn();
  commit = vi.fn(async (operation: { after: QuickEditAdvancedContent }) => {
    content = operation.after;
    persisted = content;
  });
  const session = {
    getSnapshot: () => ({
      snapshot: { workspace: { aggregateId: 'review' } },
      document: { advancedContent: content, edits: [] },
    }),
    commitDurable: commit,
    reload: vi.fn(async () => {
      content = persisted;
    }),
  };
  state = {
    session,
    video: { current: { pause } },
    busy: false,
    canStart: () => true,
    time: 2,
    source: { duration: 10 },
    playbackRange: null,
    flushAdvanced: vi.fn(async () => undefined),
    audio: { setSelectedId: selected },
  } as unknown as Parameters<typeof useReviewMusicImport>[0];
  const file = new File(['audio'], 'song.wav', { type: 'audio/wav' });
  io.read.mockResolvedValue({ file, filename: file.name, entry: { id: 'asset' } });
  io.inspect.mockResolvedValue(8);
  io.publish.mockResolvedValue(undefined);
  io.cancel.mockResolvedValue(undefined);
  io.binding.mockResolvedValue({
    assetId: 'project-asset:asset',
    publish: io.publish,
    cancel: io.cancel,
  });
  io.prepare.mockResolvedValue({
    assetId: 'project-asset:upload',
    duration: 8,
    protect: async () => undefined,
    publish: io.publish,
    cancel: io.cancel,
  });
  io.saved.mockImplementation(async () => ({ workspace: { advanced: persisted } }));
  audioNodes = [];
  vi.stubGlobal(
    'Audio',
    class {
      pause = vi.fn();
      play = vi.fn(async () => undefined);
      load = vi.fn();
      removeAttribute = vi.fn();
      constructor() {
        audioNodes.push(this);
      }
    }
  );
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  function Harness() {
    api = useReviewMusicImport(state);
    return null;
  }
  await act(async () => root.render(createElement(Harness)));
}
async function open(lane: 'music' | 'voiceover' = 'music') {
  await render();
  act(() => api.open(host, lane));
}

it('captures insertion intent and commits one bounded normal music clip durably', async () => {
  content = {
    ...content,
    audio: { ...content.audio, music: [importedAudioClip('next', 2, 5, 10)] },
  };
  persisted = content;
  await open();
  state.time = 8;
  await act(async () => api.drawer!.onSelect('song'));
  expect(commit).toHaveBeenCalledTimes(1);
  expect(content.audio.music[1]).toMatchObject({
    timelineStart: 2,
    duration: 3,
    assetId: 'project-asset:asset',
  });
  expect(selected).toHaveBeenCalledWith(content.audio.music[1]!.id, 'music');
  expect(state.flushAdvanced).toHaveBeenCalledTimes(1);
  expect(api.drawer).toBeNull();
  expect(pause).toHaveBeenCalled();
});

it.each(['music', 'voiceover'] as const)(
  'retries upload publication with the original File and without repeating insertion (%s)',
  async (lane) => {
    const file = new File(['audio'], 'upload.wav', { type: 'audio/wav' });
    io.publish.mockRejectedValueOnce(new Error('publication'));
    await open(lane);
    await act(async () => {
      await expect(api.drawer!.onUpload(file)).rejects.toThrow('publication');
    });
    expect(content.audio[lane]).toHaveLength(1);
    expect(api.drawer).not.toBeNull();
    await act(async () => api.drawer!.onRetry!());
    expect(io.prepare).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(io.publish).toHaveBeenCalledTimes(2);
    expect(api.drawer).toBeNull();
  }
);

it.each(['music', 'voiceover'] as const)(
  'retains an ambiguous durable attachment and retries publication without a second clip (%s)',
  async (lane) => {
    commit.mockImplementationOnce(async (operation: { after: QuickEditAdvancedContent }) => {
      persisted = operation.after;
      throw new Error('response lost');
    });
    await open(lane);
    await act(async () => {
      await expect(api.drawer!.onSelect('song')).rejects.toThrow('response lost');
    });
    expect(state.session.reload).toHaveBeenCalledTimes(1);
    expect(io.cancel).not.toHaveBeenCalled();
    await act(async () => api.drawer!.onRetry!());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(content.audio[lane]).toHaveLength(1);
  }
);

it.each(['music', 'voiceover'] as const)(
  'cancels a pending selection on close before it acquires an asset (%s)',
  async (lane) => {
    let resolve!: (value: { file: File; filename: string; entry: { id: string } }) => void;
    io.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    await open(lane);
    let flight!: Promise<void>;
    act(() => {
      flight = api.drawer!.onSelect('song');
    });
    act(() => api.drawer!.onClose());
    await act(async () => {
      resolve({ file: new File(['a'], 'song.wav'), filename: 'song.wav', entry: { id: 'asset' } });
      await expect(flight).rejects.toThrow();
    });
    expect(commit).not.toHaveBeenCalled();
    expect(io.binding).not.toHaveBeenCalled();
    expect(api.drawer).toBeNull();
  }
);

it('discards a stale preview read and releases the active native preview on close', async () => {
  let resolve!: (value: { file: File; filename: string }) => void;
  io.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await open();
  let first!: Promise<void>;
  act(() => {
    first = api.drawer!.onPreview('old');
  });
  await act(async () => api.drawer!.onPreview('new'));
  await act(async () => {
    resolve({ file: new File(['a'], 'old.wav'), filename: 'old.wav' });
    await first;
  });
  expect(audioNodes).toHaveLength(1);
  expect(api.drawer!.playingId).toBe('new');
  expect(commit).not.toHaveBeenCalled();
  act(() => api.drawer!.onClose());
  expect(audioNodes[0]!.pause).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

it('revalidates occupied placement after the picker opens', async () => {
  await open();
  content = {
    ...content,
    audio: { ...content.audio, music: [importedAudioClip('neighbor', 4, 1, 10)] },
  };
  persisted = content;
  await act(async () => {
    await expect(api.drawer!.onSelect('song')).rejects.toThrow('musicNoSpace');
  });
  expect(commit).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledTimes(1);
});

it('bounds selection placement and rejects cuts, end and occupied spans', () => {
  expect(reviewMusicPlacement(2, 4, [])).toEqual({ start: 2, end: 4 });
  for (const start of [null, 10, 11, Number.NaN])
    expect(() => reviewMusicPlacement(start, 10, [])).toThrow();
  expect(() => reviewMusicPlacement(2, 10, [importedAudioClip('neighbor', 3, 1, 10)])).toThrow();
});

it('captures voiceover lane and source clock independently of music result placement', async () => {
  state.time = 4;
  state.session.getSnapshot = (() => ({
    snapshot: { workspace: { aggregateId: 'review' } },
    document: {
      advancedContent: content,
      edits: [
        { id: 'cut', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
        {
          id: 'speed',
          kind: 'speed',
          start: 2,
          end: 6,
          requestedStart: 2,
          requestedEnd: 6,
          rate: 2,
          audio: 'speed',
        },
      ],
    },
  })) as typeof state.session.getSnapshot;
  await render();
  act(() => api.open(host, 'voiceover'));
  state.time = 9;
  await act(async () => api.drawer!.onSelect('voice'));
  expect(content.audio.music).toHaveLength(0);
  expect(content.audio.voiceover).toHaveLength(1);
  expect(content.audio.voiceoverSegments).toEqual(
    createReviewTimeMap(
      state.source.duration,
      state.session.getSnapshot().document.edits
    ).getSegments()
  );
  expect(content.audio.voiceover[0]!.sourceAnchor?.[0]?.start).toBe(4);
  expect(selected).toHaveBeenCalledWith(content.audio.voiceover[0]!.id, 'voiceover');
  expect(io.publish).toHaveBeenCalledOnce();
});

it('cancels a captured voiceover library read when the project changes', async () => {
  let finish!: (source: { file: File; filename: string; entry: { id: string } }) => void;
  io.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await open('voiceover');
  let flight!: Promise<void>;
  act(() => {
    flight = api.drawer!.onSelect('voice');
  });
  state = { ...state, session: { ...state.session } };
  await render();
  await act(async () => {
    finish({ file: new File(['a'], 'voice.wav'), filename: 'voice.wav', entry: { id: 'voice' } });
    await expect(flight).rejects.toThrow();
  });
  expect(io.binding).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
