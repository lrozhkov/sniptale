// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewBackgroundImage, useReviewBackgroundImport } from './use-review-background';
import { useReviewAdvanced } from './use-advanced';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { importReviewBackgroundImage } from '../../workflows/video-review/background-image';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
const mocks = vi.hoisted(() => ({ read: vi.fn(), import: vi.fn(), commit: vi.fn() }));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: mocks.read,
}));
vi.mock('../../workflows/video-review/background-image', () => ({
  importReviewBackgroundImage: mocks.import,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (load) => ({
  ...(await load<typeof import('../../composition/persistence/review-workspaces/store')>()),
  commitVideoWorkspace: mocks.commit,
}));
let root: Root;
let host: HTMLDivElement;
const revoke = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:background'),
    revokeObjectURL: revoke,
  });
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const background: QuickEditBackgroundSettings = {
  enabled: true,
  type: 'image',
  assetId: 'project-asset:image',
  imageFit: 'cover',
  layout: { padding: 8, cornerRadius: 4 },
};

it('waits for publication, retries missing bytes, and releases preview URLs', async () => {
  let image!: ReturnType<typeof useReviewBackgroundImage>;
  function Harness({ pending }: { pending: boolean }) {
    image = useReviewBackgroundImage(background, pending);
    return null;
  }
  await act(async () => root.render(<Harness pending />));
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockResolvedValueOnce(null);
  await act(async () => root.render(<Harness pending={false} />));
  expect(image.failed).toBe(true);
  mocks.read.mockResolvedValueOnce(new Blob(['image']));
  await act(async () => image.retry());
  expect(image.url).toBe('blob:background');
  expect(image.failed).toBe(false);
  await act(async () => root.render(<Harness pending />));
  expect(revoke).toHaveBeenCalledWith('blob:background');
});
it('ignores an obsolete image read after switching backgrounds', async () => {
  let resolve!: (blob: Blob) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise<Blob>((done) => {
        resolve = done;
      })
  );
  let image!: ReturnType<typeof useReviewBackgroundImage>;
  function Harness({ value }: { value: QuickEditBackgroundSettings }) {
    image = useReviewBackgroundImage(value);
    return null;
  }
  await act(async () => root.render(<Harness value={background} />));
  await act(async () => root.render(<Harness value={{ enabled: false }} />));
  await act(async () => resolve(new Blob(['old'])));
  expect(image.url).toBeUndefined();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

function sessionFixture() {
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { width: 160, height: 90, duration: 12, mimeType: 'video/webm', size: 5 },
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  mocks.commit.mockImplementation(async () => snapshot);
  return createVideoReviewSession(snapshot);
}
it('rejects duplicate import, attaches through history, and preserves the old background on failure', async () => {
  const session = sessionFixture();
  let importer!: ReturnType<typeof useReviewBackgroundImport>;
  let release!: () => void;
  const ready = new Promise<void>((done) => {
    release = done;
  });
  mocks.import.mockImplementationOnce(
    async (args: Parameters<typeof importReviewBackgroundImage>[0]) => {
      await ready;
      await args.attach('project-asset:imported');
    }
  );
  function Harness() {
    importer = useReviewBackgroundImport({
      advanced: useReviewAdvanced(session),
      session,
      allowed: () => true,
    });
    return null;
  }
  await act(async () => root.render(<Harness />));
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  let first!: Promise<void>;
  await act(async () => {
    first = importer.importImage(file);
  });
  expect(importer.pending).toBe(true);
  await act(async () => importer.importImage(file));
  expect(mocks.import).toHaveBeenCalledOnce();
  await act(async () => {
    release();
    await first;
  });
  expect(mocks.commit).toHaveBeenCalledOnce();
  expect(importer.pending).toBe(false);
  mocks.import.mockRejectedValueOnce(new Error('decode'));
  await act(async () => importer.importImage(file));
  expect(importer.failed).toBe(true);
  expect(session.getSnapshot().document.advancedContent.background).toEqual({ enabled: false });
});
