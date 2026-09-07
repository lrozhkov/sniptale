// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoEditorLibraries, useVideoEditorMediaLibrary } from './libraries';

import { listMediaLibrary } from '../../../composition/persistence/media-library/index';
import { listGallerySavedViews } from '../../../composition/persistence/gallery-saved-views/index';
vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: vi.fn(),
}));
vi.mock('../../../composition/persistence/gallery-saved-views/index', () => ({
  listGallerySavedViews: vi.fn(),
}));

const { listProjectExports, listRecordings, listVideoProjects } = vi.hoisted(() => ({
  listProjectExports: vi.fn(),
  listRecordings: vi.fn(),
  listVideoProjects: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  listProjectExports,
  listVideoProjects,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  listRecordings,
}));

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

describe('editor libraries', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let latestState: ReturnType<typeof useVideoEditorLibraries> | null = null;

  function Harness() {
    latestState = useVideoEditorLibraries();
    return null;
  }

  function getState() {
    if (!latestState) {
      throw new Error('Libraries state is not ready');
    }

    return latestState;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    listProjectExports.mockReset();
    listRecordings.mockReset();
    listVideoProjects.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    latestState = null;
    container?.remove();
    container = null;
  });

  it('ignores stale project export refresh results after a newer project request starts', async () => {
    const projectA = createDeferred<Array<{ id: string; createdAt: number }>>();
    const projectB = createDeferred<Array<{ id: string; createdAt: number }>>();

    listProjectExports.mockImplementationOnce(() => projectA.promise);
    listProjectExports.mockImplementationOnce(() => projectB.promise);

    await act(async () => {
      root?.render(<Harness />);
    });
    await act(async () => {
      void getState().refreshProjectExports('project-a');
      void getState().refreshProjectExports('project-b');
    });
    await act(async () => {
      projectB.resolve([{ id: 'export-b', createdAt: 2 }]);
      await Promise.resolve();
    });
    await act(async () => {
      projectA.resolve([{ id: 'export-a', createdAt: 1 }]);
      await Promise.resolve();
    });

    expect(getState().projectExports).toEqual([{ id: 'export-b', createdAt: 2 }]);
  });
});

describe('media picker collection', () => {
  let root: Root;
  let container: HTMLDivElement;
  let current: ReturnType<typeof useVideoEditorMediaLibrary>;
  function Harness({ open }: { open: boolean }) {
    current = useVideoEditorMediaLibrary(open);
    return null;
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
    vi.mocked(listMediaLibrary).mockResolvedValue([]);
    vi.mocked(listGallerySavedViews).mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
  it('loads media and presets together, ignores stale requests and exposes retryable errors', async () => {
    let resolveOld: (value: Awaited<ReturnType<typeof listGallerySavedViews>>) => void = () => {};
    vi.mocked(listGallerySavedViews).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    );
    await act(async () => root.render(<Harness open />));
    expect(current.loading).toBe(true);
    const preset = {
      id: 'new',
      name: 'Current',
      folderFilter: 'all' as const,
      createdAt: 1,
      updatedAt: 1,
      filters: {
        activeTags: [],
        scope: 'all' as const,
        facetFilters: {
          created: [],
          updated: [],
          format: [],
          size: [],
          resolution: [],
          duration: [],
          source: [],
        },
      },
    };
    vi.mocked(listGallerySavedViews).mockResolvedValue([preset]);
    await act(async () => current.refresh());
    expect(current.savedViews).toEqual([preset]);
    await act(async () => resolveOld([]));
    expect(current.savedViews).toEqual([preset]);
    expect(current.loading).toBe(false);
    vi.mocked(listMediaLibrary).mockRejectedValueOnce(new Error('read failed'));
    await act(async () => current.refresh());
    expect(current.error).not.toBeNull();
    expect(current.items).toEqual([]);
    expect(current.savedViews).toEqual([]);
    await act(async () => current.refresh());
    expect(current.error).toBeNull();
    expect(current.savedViews).toEqual([preset]);
  });
  it('invalidates a pending collection on close and reloads on reopen', async () => {
    let resolveOld: (value: Awaited<ReturnType<typeof listMediaLibrary>>) => void = () => {};
    vi.mocked(listMediaLibrary).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    );
    await act(async () => root.render(<Harness open />));
    await act(async () => root.render(<Harness open={false} />));
    await act(async () => resolveOld([]));
    expect(listMediaLibrary).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Harness open />));
    expect(listMediaLibrary).toHaveBeenCalledTimes(2);
    expect(current.loading).toBe(false);
    expect(current.error).toBeNull();
  });
});
