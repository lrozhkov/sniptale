// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewPresentation } from './use-review-presentation';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';
import type { ReviewOperation } from '../../features/video/review/types';
import { ReviewPresentationAdmissionError } from '../../workflows/video-review/presentation-admission';
import { StaticLogoError } from '../../workflows/background-images/static-logo';

type AttachmentArgs = Parameters<
  typeof import('../../workflows/video-review/presentation-attachment').createReviewPresentationAttachment
>[0];
const io = vi.hoisted(() => ({
  prepareImage: vi.fn(),
  inspect: vi.fn(),
  entry: vi.fn(),
  frozen: vi.fn(),
  binding: vi.fn(),
  attachment: vi.fn(),
  publish: vi.fn(),
  bitmap: vi.fn(),
}));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../workflows/background-images/static-logo', () => ({
  prepareStaticLogo: io.prepareImage,
  StaticLogoError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('../../workflows/video-review/presentation-admission', () => ({
  inspectReviewPresentationVideo: io.inspect,
  ReviewPresentationAdmissionError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('../../composition/background-resources/acquisition', () => ({
  readLibraryBackground: io.frozen,
}));
vi.mock('../../composition/persistence/media-library', () => ({ getMediaLibraryEntry: io.entry }));
vi.mock('../../composition/persistence/projects/library-scene-binding', () => ({
  readLibrarySceneBindingSource: io.binding,
}));
vi.mock('../../workflows/video-review/presentation-attachment', () => ({
  createReviewPresentationAttachment: io.attachment,
}));
let root: Root;
let host: HTMLDivElement;
let args: Parameters<typeof useReviewPresentation>[0];
let api: ReturnType<typeof useReviewPresentation>;
let content: QuickEditAdvancedContent;
let commit: ReturnType<typeof vi.fn<(operation: ReviewOperation) => Promise<void>>>;
let reload: ReturnType<typeof vi.fn<() => Promise<void>>>;
function Harness() {
  api = useReviewPresentation(args);
  return null;
}
async function render(strict = false) {
  await act(async () =>
    root.render(
      strict ? (
        <StrictMode>
          <Harness />
        </StrictMode>
      ) : (
        <Harness />
      )
    )
  );
}
function file(type = 'image/png') {
  return new File(['media'], type.startsWith('image') ? 'image.png' : 'video.webm', { type });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function select(
  slot: 'intro' | 'outro' = 'intro',
  kind: 'image' | 'video' = 'image',
  source: 'computer' | 'library' = 'computer'
) {
  act(() => api.choose(slot, kind, source));
  return api.picker!;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('createImageBitmap', io.bitmap);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  content = {
    ...createQuickEditAdvancedContent(),
    presentation: createNeutralPresentationSettings(),
    canvas: { width: 1280, height: 720 },
  };
  commit = vi.fn(async (operation) => {
    if (operation.target === 'advancedContent') {
      content = operation.after;
      args.settings = content.presentation;
    }
  });
  reload = vi.fn(async () => undefined);
  args = {
    session: {
      getSnapshot: () => ({
        document: { advancedContent: content },
        snapshot: { workspace: { aggregateId: 'workspace' } },
      }),
      commitDurable: commit,
      reload,
    },
    settings: content.presentation,
    stageSettings: vi.fn((presentation) => {
      const { presentation: _previous, ...rest } = content;
      content = presentation ? { ...rest, presentation } : rest;
      args.settings = presentation;
    }),
    flushAdvanced: vi.fn(async () => undefined),
    allowed: () => true,
    pause: vi.fn(),
  };
  io.prepareImage.mockImplementation(async (input: File) => input);
  io.bitmap.mockResolvedValue({ width: 100, height: 50, close: vi.fn() });
  io.inspect.mockResolvedValue({
    source: { duration: 2, width: 100, height: 50, mimeType: 'video/webm', size: 5 },
    hasAudio: true,
  });
  io.publish.mockResolvedValue(undefined);
  io.entry.mockResolvedValue({ kind: 'image', workspaceRevision: 0 });
  io.frozen.mockResolvedValue({ file: file(), originMediaId: 'library-image' });
  io.binding.mockImplementation(async (mediaId: string, kind: string) => ({
    mediaId,
    filename: 'Library',
    source: { kind: 'stored-asset', assetId: 'blob' },
    ref: { mimeType: kind === 'image' ? 'image/png' : 'video/webm' },
    entry: null,
    file: file(kind === 'image' ? 'image/png' : 'video/webm'),
  }));
  io.attachment.mockImplementation((options: AttachmentArgs) => {
    let retained = false,
      attached = false;
    return {
      hasRetainedAsset: () => retained,
      run: async () => {
        options.assertCurrentTarget();
        retained = true;
        if (!attached) {
          await options.attach('project-asset:attached');
          attached = true;
        }
        await io.publish();
        return { assetId: 'project-asset:attached' };
      },
    };
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('keeps previews disposable and stages a rapid parameter burst without acquisition locks', async () => {
  await render();
  const next = { ...api.settings, audioFade: true };
  act(() => api.preview(next));
  expect(api.settings.audioFade).toBe(true);
  expect(args.stageSettings).not.toHaveBeenCalled();
  await act(async () => {
    expect(await api.change(next)).toBe(true);
    expect(await api.change({ ...next, color: '#ffffffff' })).toBe(true);
  });
  await render();
  expect(api.pending).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  expect(args.flushAdvanced).not.toHaveBeenCalled();
  expect(content.presentation?.audioFade).toBe(true);
  expect(content.presentation?.color).toBe('#ffffffff');
});

it('keeps independent empty modes transient and remembers variants through None', async () => {
  await render();
  await act(async () => {
    await api.mode('intro', 'image');
    await api.mode('outro', 'video');
  });
  expect(api.slotModes).toEqual({ intro: 'image', outro: 'video' });
  expect(commit).not.toHaveBeenCalled();
  const request = select();
  await act(async () => {
    await api.selectComputer(request, file());
  });
  const image = content.presentation!.intro.image;
  await act(async () => {
    await api.mode('intro', 'none');
  });
  expect(content.presentation!.intro).toEqual({ mode: 'none', image });
  await act(async () => {
    await api.mode('intro', 'image');
  });
  expect(content.presentation!.intro.image).toEqual(image);
});
it('normalizes static computer acquisition and closes its dimension bitmap', async () => {
  await render();
  const request = select();
  const input = file();
  await act(async () => {
    expect(await api.selectComputer(request, input)).toBe(true);
  });
  expect(io.prepareImage).toHaveBeenCalledWith(input, expect.any(AbortSignal));
  await expect(io.bitmap.mock.results[0]!.value).resolves.toMatchObject({ width: 100 });
  const bitmap = await io.bitmap.mock.results[0]!.value;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(content.presentation!.intro.image).toMatchObject({
    assetId: 'project-asset:attached',
    duration: 3,
    width: 100,
    height: 50,
  });
  expect(api.picker).toBeNull();
  expect(api.pending).toBe(false);
});
it('freezes the visible edited Library image using the existing static-image acquisition policy', async () => {
  io.entry.mockResolvedValue({ kind: 'image', workspaceRevision: 3 });
  await render();
  const request = select('intro', 'image', 'library');
  await act(async () => {
    await api.selectLibrary(request, 'edited');
  });
  expect(io.frozen).toHaveBeenCalledWith('edited', expect.any(AbortSignal), io.prepareImage);
  expect(io.binding).not.toHaveBeenCalled();
  expect(io.attachment).toHaveBeenCalledWith(
    expect.objectContaining({
      acquisition: expect.objectContaining({
        kind: 'private-frozen-image',
        originMediaId: 'edited',
      }),
    })
  );
});
it('binds admitted immutable Library video without publishing through a second owner', async () => {
  await render();
  const request = select('outro', 'video', 'library');
  await act(async () => {
    await api.selectLibrary(request, 'recording');
  });
  expect(io.binding).toHaveBeenCalledWith('recording', 'video');
  expect(io.inspect).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal), {
    muted: false,
  });
  expect(io.attachment).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'video',
      slot: 'outro',
      acquisition: expect.objectContaining({ kind: 'library-binding' }),
    })
  );
  expect(content.presentation!.outro.video).toMatchObject({
    trim: { start: 0, end: 2 },
    audio: { muted: false, gain: 1 },
  });
});
it('requires explicit muted readmission after unsupported own audio', async () => {
  io.inspect.mockRejectedValueOnce(new ReviewPresentationAdmissionError('audio-decoder'));
  await render();
  const request = select('intro', 'video');
  await act(async () => {
    expect(await api.selectComputer(request, file('video/webm'))).toBe(false);
  });
  expect(io.attachment).not.toHaveBeenCalled();
  expect(api.audioUnsupported).toBe(true);
  expect(api.error).toBe('gallery.videoReview.presentationAudioUnsupported');
  await act(async () => {
    expect(await api.retryMuted()).toBe(true);
  });
  expect(io.inspect).toHaveBeenLastCalledWith(expect.any(File), expect.any(AbortSignal), {
    muted: true,
  });
  expect(content.presentation!.intro.video?.audio.muted).toBe(true);
});
it('retries the same retained publication without importing or attaching twice', async () => {
  io.publish.mockRejectedValueOnce(new Error('private detail'));
  await render();
  const request = select();
  await act(async () => {
    await api.selectComputer(request, file());
  });
  expect(api.canRetry).toBe(true);
  expect(api.error).toBe('gallery.videoReview.presentationAcquireFailed');
  const retained = api.picker;
  act(() => api.choose('outro', 'video', 'library'));
  expect(api.picker).toBe(retained);
  await act(async () => {
    expect(await api.change({ ...api.settings, audioFade: true })).toBe(false);
    expect(await api.retry()).toBe(true);
  });
  expect(io.prepareImage).toHaveBeenCalledOnce();
  expect(io.attachment).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledOnce();
  expect(io.publish).toHaveBeenCalledTimes(2);
});
it('cancels admission before any attachment and releases late decoded resources', async () => {
  const pendingBitmap = deferred<{ width: number; height: number; close(): void }>();
  io.bitmap.mockReturnValueOnce(pendingBitmap.promise);
  await render();
  const request = select();
  let running!: Promise<boolean>;
  await act(async () => {
    running = api.selectComputer(request, file());
    await Promise.resolve();
  });
  expect(api.pending).toBe(true);
  act(() => api.cancel());
  const bitmap = { width: 10, height: 10, close: vi.fn() };
  await act(async () => {
    pendingBitmap.resolve(bitmap);
    expect(await running).toBe(false);
  });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(io.attachment).not.toHaveBeenCalled();
  expect(api.error).toBeNull();
});
it('rejects stale picker completions and old-session callbacks', async () => {
  await render();
  const oldRequest = select();
  const oldApi = api;
  const currentRequest = select('outro', 'video');
  await act(async () => {
    expect(await api.selectComputer(oldRequest, file())).toBe(false);
  });
  expect(api.picker).toBe(currentRequest);
  args = { ...args, session: { ...args.session } };
  await render();
  await act(async () => {
    expect(await oldApi.change(createNeutralPresentationSettings())).toBe(false);
  });
  expect(commit).not.toHaveBeenCalled();
  expect(api.picker).toBeNull();
});
it('keeps asset publication recoverable after parameters were staged', async () => {
  await render();
  await act(async () => {
    await api.change({ ...api.settings, audioFade: true });
  });
  await render();
  io.publish.mockRejectedValueOnce(new Error('publication failed'));
  const request = select();
  await act(async () => {
    expect(await api.selectComputer(request, file())).toBe(false);
  });
  await act(async () => {
    expect(await api.retry()).toBe(true);
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(content.presentation?.audioFade).toBe(true);
});

it('stages reset and clears preview when authored state is restored', async () => {
  await render();
  act(() => api.preview({ ...api.settings, audioFade: true }));
  args.settings = createNeutralPresentationSettings();
  await render();
  expect(api.settings.audioFade).toBe(false);
  await act(async () => {
    await api.reset();
  });
  expect(content.presentation).toBeUndefined();
  expect(content.canvas).toEqual({ width: 1280, height: 720 });
  expect(commit).not.toHaveBeenCalled();
  expect(args.stageSettings).toHaveBeenCalledOnce();
});
it('keeps StrictMode effect replay usable and reports static image failures without raw details', async () => {
  await render(true);
  io.prepareImage.mockRejectedValueOnce(new StaticLogoError('animated'));
  const request = select();
  await act(async () => {
    expect(await api.selectComputer(request, file())).toBe(false);
  });
  expect(api.error).toBe('gallery.videoReview.watermarkImageAnimated');
  expect(io.attachment).not.toHaveBeenCalled();
});
it('ignores disabled editing and invalid authored drafts', async () => {
  await render();
  const bad = { ...api.settings, color: '#00000000' };
  act(() => api.preview(bad));
  expect(api.settings.color).toBe('#000000ff');
  await act(async () => {
    expect(await api.change(bad)).toBe(false);
  });
  args.allowed = () => false;
  act(() => api.choose('intro', 'image', 'computer'));
  expect(api.picker).toBeNull();
  expect(commit).not.toHaveBeenCalled();
});

it('blocks a late acquisition after authored presentation changed externally', async () => {
  const preparing = deferred<File>();
  io.prepareImage.mockReturnValueOnce(preparing.promise);
  await render();
  const request = select();
  let running!: Promise<boolean>;
  await act(async () => {
    running = api.selectComputer(request, file());
    await Promise.resolve();
  });
  content = { ...content, presentation: { ...content.presentation!, audioFade: true } };
  args.settings = content.presentation;
  await render();
  await act(async () => {
    preparing.resolve(file());
    expect(await running).toBe(false);
  });
  expect(io.attachment).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
it('drops pending mode overrides when undo restores a different authored mode', async () => {
  await render();
  const request = select();
  await act(async () => {
    await api.selectComputer(request, file());
  });
  expect(api.slotModes.intro).toBe('image');
  content = { ...content, presentation: createNeutralPresentationSettings() };
  args.settings = content.presentation;
  await render();
  expect(api.slotModes.intro).toBe('none');
});
it('normalizes private video MIME to the actually admitted container before attachment', async () => {
  await render();
  const request = select('intro', 'video');
  await act(async () => {
    await api.selectComputer(request, file('application/octet-stream'));
  });
  expect(io.attachment).toHaveBeenCalledWith(
    expect.objectContaining({
      acquisition: expect.objectContaining({
        file: expect.objectContaining({ type: 'video/webm' }),
      }),
    })
  );
});
it('normalizes Library SVG into a private frozen image rather than binding unsanitized bytes', async () => {
  io.binding.mockResolvedValue({
    mediaId: 'svg',
    filename: 'a.svg',
    ref: { mimeType: 'image/svg+xml' },
    source: { kind: 'stored-asset', assetId: 'blob' },
    entry: null,
    file: file('image/svg+xml'),
  });
  io.prepareImage.mockResolvedValue(file('image/png'));
  await render();
  const request = select('intro', 'image', 'library');
  await act(async () => {
    await api.selectLibrary(request, 'svg');
  });
  expect(io.attachment).toHaveBeenCalledWith(
    expect.objectContaining({
      acquisition: expect.objectContaining({
        kind: 'private-frozen-image',
        originMediaId: 'svg',
        file: expect.objectContaining({ type: 'image/png' }),
      }),
    })
  );
});
it('retains publication recovery across explicit cancellation', async () => {
  io.publish.mockRejectedValueOnce(new Error('publication'));
  await render();
  const request = select();
  await act(async () => {
    await api.selectComputer(request, file());
  });
  act(() => api.cancel());
  expect(api.canRetry).toBe(true);
  expect(api.picker).toBeNull();
  await act(async () => {
    expect(await api.retry()).toBe(true);
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(io.attachment).toHaveBeenCalledOnce();
});
it('aborts detached session acquisition and closes a late bitmap after unmount', async () => {
  const pending = deferred<{ width: number; height: number; close(): void }>();
  io.bitmap.mockReturnValueOnce(pending.promise);
  await render();
  const request = select();
  let running!: Promise<boolean>;
  await act(async () => {
    running = api.selectComputer(request, file());
    await Promise.resolve();
  });
  await act(async () => root.unmount());
  root = createRoot(host);
  const bitmap = { width: 1, height: 1, close: vi.fn() };
  pending.resolve(bitmap);
  expect(await running).toBe(false);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
});

it('invalidates an open picker when its slot mode changes', async () => {
  await render();
  const request = select();
  await act(async () => {
    await api.mode('intro', 'none');
  });
  expect(api.picker).toBeNull();
  await act(async () => {
    expect(await api.selectComputer(request, file())).toBe(false);
  });
  expect(io.prepareImage).not.toHaveBeenCalled();
});
it('retains late uncertain preparation after cancellation until explicit recovery', async () => {
  const finished = deferred<void>();
  let retained = false;
  io.attachment.mockImplementation(() => ({
    hasRetainedAsset: () => retained,
    run: async () => {
      await finished.promise;
      retained = true;
      throw new Error('uncertain durable owner');
    },
  }));
  await render();
  const request = select();
  let running!: Promise<boolean>;
  await act(async () => {
    running = api.selectComputer(request, file());
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(io.attachment).toHaveBeenCalledOnce();
  act(() => api.cancel());
  await act(async () => {
    finished.resolve();
    expect(await running).toBe(false);
  });
  expect(api.canRetry).toBe(true);
  act(() => api.choose('outro', 'video', 'computer'));
  expect(api.picker).toBeNull();
});

it('does not overwrite an authored restore that arrives while flushing prior advanced edits', async () => {
  const flushing = deferred<void>();
  args.flushAdvanced = () => flushing.promise;
  await render();
  let running!: Promise<boolean>;
  const request = select();
  await act(async () => {
    running = api.selectComputer(request, file());
    await Promise.resolve();
  });
  content = { ...content, presentation: { ...content.presentation!, color: '#ffffffff' } };
  args.settings = content.presentation;
  await render();
  await act(async () => {
    flushing.resolve();
    expect(await running).toBe(false);
  });
  expect(commit).not.toHaveBeenCalled();
  expect(content.presentation!.color).toBe('#ffffffff');
});
it('binds unchanged Library raster bytes while keeping remembered video settings', async () => {
  content.presentation!.intro = {
    mode: 'none',
    video: {
      assetId: 'project-asset:video',
      source: { duration: 1, width: 100, height: 50, mimeType: 'video/webm', size: 5 },
      trim: { start: 0, end: 1 },
      fit: 'cover',
      fillColor: '#000000ff',
      crop: { panX: 0.2, panY: -0.1 },
      audio: { muted: true, gain: 0.5 },
    },
  };
  await render();
  const request = select('intro', 'image', 'library');
  await act(async () => {
    await api.selectLibrary(request, 'raster');
  });
  expect(io.attachment).toHaveBeenCalledWith(
    expect.objectContaining({ acquisition: expect.objectContaining({ kind: 'library-binding' }) })
  );
  expect(content.presentation!.intro.video?.audio).toEqual({ muted: true, gain: 0.5 });
});
it('rejects mismatched actual video container facts for an immutable Library binding', async () => {
  io.inspect.mockResolvedValue({
    source: { duration: 2, width: 100, height: 50, mimeType: 'video/mp4', size: 5 },
    hasAudio: false,
  });
  await render();
  const request = select('intro', 'video', 'library');
  await act(async () => {
    expect(await api.selectLibrary(request, 'wrong-mime')).toBe(false);
  });
  expect(io.attachment).not.toHaveBeenCalled();
  expect(api.error).toBe('gallery.videoReview.presentationAcquireFailed');
});
it('preserves neutral settings identity across legacy hook rerenders', async () => {
  args.settings = undefined;
  await render();
  const initial = api.settings;
  await render();
  expect(api.settings).toBe(initial);
});
