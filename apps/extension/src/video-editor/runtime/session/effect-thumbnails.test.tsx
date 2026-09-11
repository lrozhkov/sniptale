// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useEffectClipPreviews } from './effect-thumbnails';
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  commit: vi.fn(),
  begin: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
}));
vi.mock('./effect-thumbnail-plans', () => ({
  buildEffectThumbnailPlans: () => [
    { clipId: 'clip', projectId: 'project', key: 'stable', plan: { time: 1 } },
  ],
}));
vi.mock('../../../composition/persistence/video-preview-cache/thumbnails', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/video-preview-cache/thumbnails')
  >()),
  createTimelineThumbnailStore: () => ({
    load: mocks.load,
    commit: mocks.commit,
    begin: mocks.begin,
  }),
}));
vi.mock('../../../workflows/video/effect-runtime-sandbox', async (original) => ({
  ...(await original<typeof import('../../../workflows/video/effect-runtime-sandbox')>()),
  createEffectRuntimeSandboxExecutor: () => {
    mocks.create();
    return { renderFrame: mocks.render, dispose: mocks.dispose };
  },
}));
vi.mock('../../../features/video/composition/effect-runtime/runtime/request', () => ({
  createEffectRuntimeRenderMessage: async () => ({}),
}));
vi.mock('@sniptale/runtime-contracts/effect-v1', async (original) => ({
  ...(await original<typeof import('@sniptale/runtime-contracts/effect-v1')>()),
  sha256EffectV1Bytes: async () => 'hash',
}));
let root: Root;
let container: HTMLDivElement;
function Harness() {
  const previews = useEffectClipPreviews(null, null);
  return <span>{previews['clip']?.kind ?? 'empty'}</span>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:cover'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 10;
      height = 10;
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob() {
        return new Blob(['cover'], { type: 'image/webp' });
      }
    }
  );
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.begin.mockResolvedValue({});
  mocks.load.mockResolvedValue([]);
  mocks.commit.mockResolvedValue(undefined);
  mocks.render.mockResolvedValue({
    kind: 'frame',
    bitmap: { width: 10, height: 10, close: mocks.close },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    root.render(<Harness />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
it('uses persisted covers without starting a sandbox and revokes only owned URLs', async () => {
  mocks.load.mockResolvedValue([{ blob: new Blob(['cached'], { type: 'image/webp' }) }]);
  await mount();
  expect(container.textContent).toBe('image');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.commit).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
  root = createRoot(container);
});
it('closes generated bitmaps, stores project-scoped covers and disposes the renderer', async () => {
  await mount();
  expect(container.textContent).toBe('image');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.commit).toHaveBeenCalledWith({}, [
    expect.objectContaining({
      projectId: 'project',
      sourceKey: 'effect-v1-thumbnail:hash',
      sourceTime: 1,
    }),
  ]);
});
it('drops late frames after unmount instead of retaining GPU or URL resources', async () => {
  let complete!: (frame: unknown) => void;
  mocks.render.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  await mount();
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () =>
    complete({ kind: 'frame', bitmap: { width: 10, height: 10, close: mocks.close } })
  );
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(mocks.commit).not.toHaveBeenCalled();
});
it('keeps the editor usable when optional generation or cache storage fails', async () => {
  mocks.begin.mockRejectedValue(new Error('quota'));
  mocks.load.mockRejectedValue(new Error('offline'));
  mocks.render.mockResolvedValue({ kind: 'error' });
  await mount();
  expect(container.textContent).toBe('empty');
  expect(mocks.dispose).toHaveBeenCalled();
});
