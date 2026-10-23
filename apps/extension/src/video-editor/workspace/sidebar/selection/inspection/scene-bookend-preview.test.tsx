// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectAsset } from '../../../../../features/video/project/factories/creation';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
} from '../../../../../features/video/project/scene/bookend-media';
import { loadVideoEditorAssetBlob } from '../../../../runtime/session/asset-urls';
import { SceneBookendPreview } from './scene-bookend-preview';

vi.mock('../../../../runtime/session/asset-urls', () => ({ loadVideoEditorAssetBlob: vi.fn() }));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const createUrl = vi.fn(() => 'blob:source-preview');
const revokeUrl = vi.fn();
function asset(id: string, type: 'IMAGE' | 'VIDEO' = 'IMAGE') {
  return createVideoProjectAsset(
    id,
    type,
    { kind: 'project-asset', projectAssetId: `${id}-bytes` },
    {
      width: 641,
      height: 359,
      duration: type === 'VIDEO' ? 6 : null,
      hasAudio: true,
      mimeType: type === 'VIDEO' ? 'video/webm' : 'image/png',
      size: 100,
      audioPeaks: null,
    }
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('does not adopt a delayed source after replacement or unmount and revokes the current URL', async () => {
  const first = asset('first');
  const second = asset('second');
  let resolveFirst: (value: Blob) => void = () => {
    throw new Error('Missing request');
  };
  vi.mocked(loadVideoEditorAssetBlob)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValue(new Blob(['second']));
  const settings = createBookendImagePresentation();
  await act(async () =>
    root.render(
      <SceneBookendPreview asset={first} settings={settings} output={{ width: 321, height: 181 }} />
    )
  );
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={second}
        settings={settings}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  expect(host.querySelector('img')?.alt).toBe('second');
  await act(async () => resolveFirst(new Blob(['first'])));
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(host.querySelector('img')?.alt).toBe('second');
  await act(async () => root.render(null));
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:source-preview');
});

it('keeps authoring on read failure and provides an explicit retry with clean URL ownership', async () => {
  const source = asset('image');
  const settings = { ...createBookendImagePresentation(), fillColor: '#123456ff' };
  const before = structuredClone(settings);
  vi.mocked(loadVideoEditorAssetBlob)
    .mockRejectedValueOnce(new Error('Private source path'))
    .mockResolvedValueOnce(new Blob(['bytes']));
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={source}
        settings={settings}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'videoEditor.sidebar.bookendPreviewFailed'
  );
  expect(host.textContent).not.toContain('Private source path');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('img')).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(settings).toEqual(before);
});

it('seeks only the disposable video to the authored trim and retains fractional framing', async () => {
  const source = asset('movie', 'VIDEO');
  const settings = { ...createBookendVideoPresentation(6), trim: { start: 1.137, end: 4.5 } };
  vi.mocked(loadVideoEditorAssetBlob).mockResolvedValue(new Blob(['video']));
  const main = document.createElement('video');
  main.currentTime = 4.2;
  document.body.append(main);
  try {
    await act(async () =>
      root.render(
        <SceneBookendPreview
          asset={source}
          settings={settings}
          output={{ width: 321, height: 181 }}
        />
      )
    );
    const preview = host.querySelector('video')!;
    act(() => preview.dispatchEvent(new Event('loadedmetadata')));
    expect(preview.currentTime).toBe(1.137);
    expect(main.currentTime).toBe(4.2);
    expect(preview.style.height).not.toBe('100%');
    expect(preview.muted).toBe(true);
    expect(loadVideoEditorAssetBlob).toHaveBeenCalledExactlyOnceWith(source);
  } finally {
    main.remove();
  }
});
