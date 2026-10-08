// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewWatermark } from './use-review-watermark';
import { createQuickEditWatermark } from '../../features/video/review/advanced/watermark';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedContent } from '../../features/video/review/advanced/types';

const io = vi.hoisted(() => ({
  prepare: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  protect: vi.fn(),
  read: vi.fn(),
  saved: vi.fn(),
  decode: vi.fn(),
}));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: io.prepare }));
vi.mock('../../composition/persistence/projects/voiceover-publication-lock', () => ({
  withVoiceoverAttachmentLock: (_id: string, action: () => Promise<unknown>) => action(),
}));
vi.mock('../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: io.saved,
}));
vi.mock('../../composition/persistence/review-workspaces/asset-refs', () => ({
  reviewWorkspaceHasWatermarkImage: (
    workspace: { advanced: QuickEditAdvancedContent },
    id: string
  ) => workspace.advanced.watermark?.image?.assetId === id,
}));
vi.mock('../../workflows/video-review/asset-bytes', () => ({ resolveReviewAssetBytes: io.read }));
let root: Root;
let host: HTMLDivElement;
let args: Parameters<typeof useReviewWatermark>[0];
let api: ReturnType<typeof useReviewWatermark>;
let content: QuickEditAdvancedContent;
let persisted: QuickEditAdvancedContent;
let commit: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
const file = () => new File(['logo'], 'logo.png', { type: 'image/png' });
const logo = { assetId: 'project-asset:logo', width: 200, height: 100, size: 0.2, opacity: 1 };
function Harness() {
  api = useReviewWatermark(args);
  return null;
}
async function render() {
  await act(async () => root.render(<Harness />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('createImageBitmap', io.decode);
  io.decode.mockResolvedValue({ width: 200, height: 100, close: vi.fn() });
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  content = {
    ...createQuickEditAdvancedContent(),
    watermark: { ...createQuickEditWatermark('Saved'), mode: 'text' },
  };
  persisted = content;
  commit = vi.fn(async (operation: { after: QuickEditAdvancedContent }) => {
    content = operation.after;
    persisted = content;
  });
  reload = vi.fn(async () => {
    content = persisted;
  });
  args = {
    settings: content.watermark,
    session: {
      getSnapshot: () => ({
        document: { advancedContent: content },
        snapshot: { workspace: { aggregateId: 'project' } },
      }),
      commitDurable: commit,
      reload,
    },
    flushAdvanced: vi.fn(async () => undefined),
    allowed: () => true,
    pause: vi.fn(),
  } as unknown as Parameters<typeof useReviewWatermark>[0];
  io.saved.mockImplementation(async () => ({ workspace: { advanced: persisted } }));
  io.read.mockResolvedValue(new Blob(['logo'], { type: 'image/png' }));
  io.prepare.mockResolvedValue({
    id: 'logo',
    publish: io.publish,
    cancel: io.cancel,
    protect: io.protect,
  });
  io.publish.mockResolvedValue(undefined);
  io.cancel.mockResolvedValue(undefined);
  io.protect.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('keeps gesture previews disposable and commits one accepted settings change', async () => {
  await render();
  const first = { ...content.watermark!, placement: { anchor: 'center' as const, margin: 0.1 } };
  const last = { ...first, placement: { ...first.placement, margin: 0.2 } };
  act(() => {
    api.preview(first);
    api.preview(last);
  });
  expect(commit).not.toHaveBeenCalled();
  expect(api.settings).toEqual(last);
  await act(async () => {
    api.change(last);
    api.change(last);
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(content.watermark).toEqual(last);
  expect(args.flushAdvanced).toHaveBeenCalledTimes(1);
  args.settings = content.watermark;
  await render();
  act(() => api.preview(first));
  act(() => api.preview(null));
  expect(api.settings).toEqual(last);
  expect(commit).toHaveBeenCalledTimes(1);
});

it('resets the logo and text in one history operation and preserves unrelated scene content', async () => {
  content = {
    ...content,
    canvas: { width: 1280, height: 720 },
    watermark: { ...content.watermark!, image: logo },
  };
  args.settings = content.watermark;
  await render();
  await act(async () => {
    await api.reset();
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(content.watermark).toBeUndefined();
  expect(content.canvas).toEqual({ width: 1280, height: 720 });
  expect(commit.mock.calls[0]![0].before.watermark.image).toEqual(logo);
});

it('retries retained image publication without decoding, preparing or attaching twice', async () => {
  io.publish.mockRejectedValueOnce(new Error('publish'));
  await render();
  const input = file();
  await act(async () => {
    await expect(api.image(input)).rejects.toThrow('publish');
  });
  expect(content.watermark?.image?.assetId).toBe('project-asset:logo');
  await act(async () => api.retry!());
  expect(io.decode).toHaveBeenCalledTimes(1);
  expect(io.prepare).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(io.publish).toHaveBeenCalledTimes(2);
  expect(api.retry).toBeUndefined();
  expect(api.error).toBeNull();
});

it('keeps committed-then-thrown image attachment and refreshes the durable session before retry', async () => {
  commit.mockImplementationOnce(async (operation: { after: QuickEditAdvancedContent }) => {
    persisted = operation.after;
    throw new Error('lost reply');
  });
  await render();
  await act(async () => {
    await expect(api.image(file())).rejects.toThrow('lost reply');
  });
  expect(reload).toHaveBeenCalledTimes(1);
  expect(io.cancel).not.toHaveBeenCalled();
  await act(async () => api.retry!());
  expect(commit).toHaveBeenCalledTimes(1);
  expect(content.watermark?.image).toMatchObject(logo);
});

it('treats acquisition cancellation as cancellation without save-failure feedback', async () => {
  let finish!: (bitmap: { width: number; height: number; close(): void }) => void;
  io.decode.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const cancel = new AbortController();
  await render();
  let flight!: Promise<void>;
  act(() => {
    flight = api.image(file(), undefined, cancel.signal);
  });
  cancel.abort();
  const close = vi.fn();
  await act(async () => {
    finish({ width: 200, height: 100, close });
    await expect(flight).rejects.toThrow();
  });
  expect(close).toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(api.error).toBeNull();
  expect(api.pending).toBe(false);
});

it('retries an adopted logo after the acquisition signal was cancelled during failed publication', async () => {
  const cancel = new AbortController();
  io.publish.mockImplementationOnce(async () => {
    cancel.abort();
    throw new Error('publication interrupted');
  });
  await render();
  await act(async () => {
    await expect(api.image(file(), undefined, cancel.signal)).rejects.toThrow();
  });
  expect(api.error).toBeNull();
  await act(async () => api.retry!());
  expect(commit).toHaveBeenCalledTimes(1);
  expect(io.prepare).toHaveBeenCalledTimes(1);
  expect(io.publish).toHaveBeenCalledTimes(2);
});

it('invalidates old project image work while a new project remains editable', async () => {
  let finish!: (bitmap: { width: number; height: number; close(): void }) => void;
  io.decode.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  let flight!: Promise<void>;
  act(() => {
    flight = api.image(file());
  });
  const other = { ...args.session };
  args = { ...args, session: other };
  await render();
  await act(async () => {
    await api.change({
      ...content.watermark!,
      text: { ...content.watermark!.text, value: 'New project' },
    });
  });
  expect(commit).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ width: 200, height: 100, close: vi.fn() });
    await expect(flight).rejects.toThrow();
  });
  expect(io.prepare).not.toHaveBeenCalled();
  expect(api.error).toBeNull();
});

it('loads remembered thumbnails once by asset identity and releases replaced or removed URLs', async () => {
  args.settings = { ...content.watermark!, mode: 'none', image: logo };
  await render();
  expect(api.imagePreviewUrl).toBe('blob:logo');
  expect(io.read).toHaveBeenCalledExactlyOnceWith('project-asset:logo');
  args.settings = { ...args.settings, mode: 'text', image: { ...logo, size: 0.5 } };
  await render();
  expect(io.read).toHaveBeenCalledTimes(1);
  args.settings = undefined;
  await render();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:logo');
  expect(api.imagePreviewUrl).toBeUndefined();
});

it('discards stale thumbnail reads without creating leaked URLs', async () => {
  let finish!: (blob: Blob) => void;
  io.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  args.settings = { ...content.watermark!, image: logo };
  await render();
  args.settings = { ...args.settings, image: { ...logo, assetId: 'project-asset:next' } };
  await render();
  await act(async () => finish(new Blob(['stale'])));
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(api.imagePreviewUrl).toBe('blob:logo');
});

it('retries unavailable resources without changing settings, history or imported assets', async () => {
  args.settings = { ...content.watermark!, image: logo };
  await render();
  const original = args.settings;
  act(() => api.onResourceError('Missing resource'));
  const obsoleteReport = api.onResourceError;
  await act(async () => api.retry!());
  expect(api.resourceRetryGeneration).toBe(1);
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(args.settings).toBe(original);
  expect(commit).not.toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.decode).not.toHaveBeenCalled();
  act(() => obsoleteReport(null));
  expect(api.error).toBe('Missing resource');
  act(() => api.onResourceError('Still missing'));
  expect(api.error).toBe('Still missing');
  expect(api.retry).toBeDefined();
  await act(async () => api.retry!());
  act(() => api.onResourceError(null));
  expect(api.error).toBeNull();
  expect(api.retry).toBeUndefined();
});

it('discards resource reports and retry actions from a departed project', async () => {
  await render();
  act(() => api.onResourceError('Old error'));
  const oldReport = api.onResourceError;
  const oldRetry = api.retry!;
  args = { ...args, session: { ...args.session } };
  await render();
  await act(async () => {
    oldReport('Late error');
    await oldRetry();
  });
  expect(api.error).toBeNull();
  expect(api.resourceRetryGeneration).toBe(0);
  expect(commit).not.toHaveBeenCalled();
});

it('refreshes an early missing thumbnail after attachment publication completes', async () => {
  let publish!: () => void;
  io.publish.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        publish = resolve;
      })
  );
  io.read.mockResolvedValueOnce(null);
  await render();
  let flight!: Promise<void>;
  await act(async () => {
    flight = api.image(file());
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(io.publish).toHaveBeenCalledTimes(1);
  args.settings = content.watermark;
  await render();
  expect(io.read).toHaveBeenCalledExactlyOnceWith('project-asset:logo');
  expect(api.imagePreviewUrl).toBeUndefined();
  expect(api.pending).toBe(true);
  await act(async () => {
    publish();
    await flight;
  });
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(api.imagePreviewUrl).toBe('blob:logo');
  expect(api.resourceRetryGeneration).toBe(1);
  expect(api.pending).toBe(false);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(io.prepare).toHaveBeenCalledTimes(1);
});

it('acknowledges only a completed text save and permits retry after a precommit failure', async () => {
  commit.mockRejectedValueOnce(new Error('write failed'));
  await render();
  const changed = {
    ...content.watermark!,
    text: { ...content.watermark!.text, value: 'Retry text' },
  };
  let result: unknown;
  await act(async () => {
    result = await api.change(changed);
  });
  expect(result).toBe(false);
  expect(content.watermark?.text.value).toBe('Saved');
  await act(async () => {
    result = await api.change(changed);
  });
  expect(result).toBe(true);
  expect(content.watermark?.text.value).toBe('Retry text');
  args.allowed = () => false;
  await act(async () => {
    result = await api.change(changed);
  });
  expect(result).toBe(false);
  expect(commit).toHaveBeenCalledTimes(2);
});

it('reconciles ambiguous text writes before explicit retry without duplicate history', async () => {
  commit.mockImplementationOnce(async (operation: { after: QuickEditAdvancedContent }) => {
    persisted = operation.after;
    throw new Error('reply lost');
  });
  await render();
  const changed = {
    ...content.watermark!,
    text: { ...content.watermark!.text, value: 'Durable text' },
  };
  let result: unknown;
  await act(async () => {
    result = await api.change(changed);
  });
  expect(result).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
  await act(async () => {
    result = await api.change(changed);
  });
  expect(result).toBe(true);
  expect(commit).toHaveBeenCalledTimes(1);
});
