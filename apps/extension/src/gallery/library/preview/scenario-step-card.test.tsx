// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../../features/scenario/project/public';
const { getBlob } = vi.hoisted(() => ({ getBlob: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/store/public', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: getBlob,
}));
import { ScenarioPreviewStepCard } from './scenario-step-card';

it('omits a hidden number and renders a custom label as text alongside its title', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const step = {
    id: 'step',
    title: 'Keep title',
    position: 4,
    images: [],
    numberLabel: null,
  };
  try {
    await act(async () => root.render(<ScenarioPreviewStepCard step={step} />));
    expect(host.textContent).toBe('Keep title');
    await act(async () =>
      root.render(<ScenarioPreviewStepCard step={{ ...step, numberLabel: '<b>A.1</b>' }} />)
    );
    expect(host.textContent).toContain('Keep title');
    expect(host.textContent).toContain('<b>A.1</b>');
    expect(host.querySelector('b')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('loads all visible images once, preserves framing, reports failures and releases URLs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const callbacks: IntersectionObserverCallback[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 120,
    height: 80,
    source: { kind: 'import', filename: 'test.png' },
  });
  image.alt = 'Alternative';
  image.caption = 'Caption';
  image.contentTransform = { x: 0.2, y: -0.1, scale: 1.5 };
  const second = { ...image, id: 'missing', assetId: 'missing' };
  getBlob
    .mockReset()
    .mockResolvedValueOnce(new Blob(['image']))
    .mockRejectedValueOnce(new Error('read failed'))
    .mockResolvedValueOnce(undefined);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ScenarioPreviewStepCard
          step={{
            id: 'step',
            title: '',
            position: 0,
            numberLabel: null,
            images: [image, second, { ...image, id: 'absent', assetId: 'absent' }],
          }}
        />
      )
    );
    expect(getBlob).not.toHaveBeenCalled();
    expect(host.querySelectorAll('figure')).toHaveLength(3);
    await act(async () => {
      for (const callback of callbacks)
        callback(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
    });
    expect(getBlob).not.toHaveBeenCalled();
    await act(async () => {
      for (const callback of callbacks)
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
    });
    expect(getBlob.mock.calls).toEqual([['asset'], ['missing'], ['absent']]);
    const img = host.querySelector('img')!;
    expect(img.alt).toBe('Alternative');
    expect(img.style.translate).toBe('20% -10%');
    expect(img.style.scale).toBe('1.5');
    expect(host.textContent).toContain('Caption');
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(2);
    await act(async () => root.unmount());
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local');
    expect(disconnect).toHaveBeenCalled();
  } finally {
    create.mockRestore();
    revoke.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('does not acquire a URL when an in-flight image finishes after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let show: (() => void) | undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        show = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver
          );
      }
      observe() {}
      disconnect() {}
    }
  );
  let resolve: ((blob: Blob) => void) | undefined;
  getBlob.mockReset().mockImplementation(
    () =>
      new Promise<Blob>((done) => {
        resolve = done;
      })
  );
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale');
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 10,
    height: 10,
    source: { kind: 'import', filename: 'test.png' },
  });
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () =>
      root.render(
        <ScenarioPreviewStepCard
          step={{ id: 'step', title: '', position: 0, numberLabel: null, images: [image] }}
        />
      )
    );
    await act(async () => show?.());
    await act(async () => root.unmount());
    await act(async () => resolve?.(new Blob(['late'])));
    expect(create).not.toHaveBeenCalled();
  } finally {
    create.mockRestore();
    vi.unstubAllGlobals();
  }
});
