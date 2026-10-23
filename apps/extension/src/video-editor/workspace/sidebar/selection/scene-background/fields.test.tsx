// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  VideoProjectAssetType,
  VideoSceneBackgroundKind,
} from '../../../../../features/video/project/types';
import {
  getSceneBackgroundAssetOptions,
  getSceneBackgroundKindOptions,
  SceneBackgroundFields,
} from './fields';
import type { SceneBackgroundFieldProps } from './shared';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createProps(): SceneBackgroundFieldProps {
  return {
    imageAssets: [
      {
        id: 'asset-1',
        type: VideoProjectAssetType.IMAGE,
        name: 'Background One',
        createdAt: 0,
        metadata: {
          audioPeaks: null,
          duration: null,
          hasAudio: false,
          height: 720,
          mimeType: 'image/png',
          size: 100,
          width: 1280,
        },
        source: { kind: 'recording', recordingId: 'rec-1' },
      },
      {
        id: 'asset-2',
        type: VideoProjectAssetType.IMAGE,
        name: 'Background Two',
        createdAt: 0,
        metadata: {
          audioPeaks: null,
          duration: null,
          hasAudio: false,
          height: 1080,
          mimeType: 'image/png',
          size: 100,
          width: 1920,
        },
        source: { kind: 'recording', recordingId: 'rec-2' },
      },
    ],
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onSetSceneBackground: vi.fn(),
    recentColors: [],
    sceneBackground: {
      kind: VideoSceneBackgroundKind.IMAGE,
      assetId: 'asset-2',
    },
  };
}

it('builds canonical background kind options for the shared select surface', () => {
  expect(getSceneBackgroundKindOptions(createProps().imageAssets)).toEqual([
    { value: 'none', label: 'gallery.videoReview.backgroundNone' },
    {
      value: VideoSceneBackgroundKind.SOLID,
      label: 'videoEditor.sidebar.sceneBackgroundSolid',
    },
    {
      value: VideoSceneBackgroundKind.GRADIENT,
      label: 'videoEditor.sidebar.sceneBackgroundGradient',
    },
    {
      value: VideoSceneBackgroundKind.IMAGE,
      label: 'videoEditor.sidebar.sceneBackgroundImage',
      disabled: false,
    },
  ]);
});

it('builds image asset options from project assets for the shared select surface', () => {
  const props = createProps();

  expect(getSceneBackgroundAssetOptions(props.imageAssets)).toEqual([
    { value: 'asset-1', label: 'Background One' },
    { value: 'asset-2', label: 'Background Two' },
  ]);
});

it('uses measured choices for background kind and keeps image resources in a dropdown', () => {
  const markup = renderToStaticMarkup(<SceneBackgroundFields {...createProps()} />);

  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundTypeLabel');
  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).toContain('shared.ui.compact-inspector.segmented-field');
  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundImage');
  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundImageAssetLabel');
  expect(markup).toContain('Background Two');
});

it('keeps image kind selected after clicking image when image assets exist', async () => {
  const onSetSceneBackground = vi.fn();

  renderBackgroundHarness({
    ...createProps(),
    onSetSceneBackground,
    sceneBackground: {
      kind: VideoSceneBackgroundKind.SOLID,
      color: '#111111',
    },
  });
  await clickBackgroundKind('videoEditor.sidebar.sceneBackgroundImage');

  expect(onSetSceneBackground).toHaveBeenCalledWith({
    kind: VideoSceneBackgroundKind.IMAGE,
    assetId: 'asset-1',
  });
  expect(
    getKindOption('videoEditor.sidebar.sceneBackgroundImage')?.getAttribute('aria-pressed')
  ).toBe('true');
});

it('offers image upload without persisting an invalid background when no assets exist', async () => {
  renderBackgroundHarness({
    ...createProps(),
    imageAssets: [],
    sceneBackground: {
      kind: VideoSceneBackgroundKind.SOLID,
      color: '#111111',
    },
  });

  expect(getKindOption('videoEditor.sidebar.sceneBackgroundImage')?.disabled).toBe(false);
  await act(async () => getKindOption('videoEditor.sidebar.sceneBackgroundImage')?.click());
  expect(container?.textContent).toContain('videoEditor.sidebar.sceneBackgroundImageEmpty');
});

function getKindOption(label: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('[aria-pressed]') ?? []).find(
    (button) => button.textContent?.trim() === label
  );
}

function SceneBackgroundHarness(props: SceneBackgroundFieldProps) {
  const [sceneBackground, setSceneBackground] = useState(props.sceneBackground);

  return (
    <SceneBackgroundFields
      {...props}
      sceneBackground={sceneBackground}
      onSetSceneBackground={(nextBackground) => {
        props.onSetSceneBackground(nextBackground);
        setSceneBackground((current) =>
          'kind' in nextBackground ? nextBackground : { ...current, ...nextBackground }
        );
      }}
    />
  );
}

function renderBackgroundHarness(props: SceneBackgroundFieldProps) {
  act(() => {
    root?.render(<SceneBackgroundHarness {...props} />);
  });
}

async function clickBackgroundKind(label: string) {
  const option = getKindOption(label);
  expect(option).not.toBeNull();
  await act(async () => {
    option?.click();
    await Promise.resolve();
  });
}

it('restores the retained image instead of choosing the first library asset', async () => {
  const props = createProps();
  renderBackgroundHarness({
    ...props,
    sceneBackground: {
      kind: 'solid',
      color: '#123456',
      remembered: { image: { kind: 'image', assetId: 'asset-2', imageFit: 'contain' } },
    },
  });
  await clickBackgroundKind('videoEditor.sidebar.sceneBackgroundImage');
  expect(props.onSetSceneBackground).toHaveBeenCalledWith({
    kind: 'image',
    assetId: 'asset-2',
    imageFit: 'contain',
  });
  expect(
    getKindOption('videoEditor.sidebar.sceneBackgroundImageContain')?.getAttribute('aria-pressed')
  ).toBe('true');
});

it('edits image fit through measured choices and preserves the asset and remembered variants', async () => {
  const props = createProps();
  const remembered = { solid: { kind: 'solid' as const, color: '#123456' } };
  renderBackgroundHarness({
    ...props,
    sceneBackground: { kind: 'image', assetId: 'asset-2', remembered },
  });
  await clickBackgroundKind('videoEditor.sidebar.sceneBackgroundImageContain');
  expect(props.onSetSceneBackground).toHaveBeenCalledWith({
    kind: 'image',
    assetId: 'asset-2',
    imageFit: 'contain',
    remembered,
  });
  expect(
    getKindOption('videoEditor.sidebar.sceneBackgroundImageContain')?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(props.onResetSceneBackgroundPreview).toHaveBeenCalled();
});

it('shows the shared blur control for image and gradient, hides it on solid and commits only the scalar', async () => {
  const props = createProps();
  renderBackgroundHarness({
    ...props,
    sceneBackground: { kind: 'image', assetId: 'asset-2', blur: 0.000123 },
  });
  const input = container?.querySelector<HTMLInputElement>(
    'input[aria-label="editor.scene.backgroundBlurAmount"]'
  );
  expect(input).toBeTruthy();
  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(input?.value).toBe('0');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '18');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(props.onSetSceneBackground).toHaveBeenLastCalledWith({ blur: 18 });
  expect(props.onResetSceneBackgroundPreview).toHaveBeenCalled();
  await clickBackgroundKind('videoEditor.sidebar.sceneBackgroundSolid');
  expect(
    container?.querySelector('input[aria-label="editor.scene.backgroundBlurAmount"]')
  ).toBeNull();
});

it('keeps disabled paint hidden until explicit activation and preserves its settings on None', async () => {
  const props = createProps();
  const retained = {
    kind: 'solid' as const,
    color: '#123456ff',
    blur: 3,
    enabled: false as const,
    remembered: {
      image: { kind: 'image' as const, assetId: 'asset-2', imageFit: 'contain' as const },
    },
  };
  renderBackgroundHarness({ ...props, sceneBackground: retained });
  expect(getKindOption('gallery.videoReview.backgroundNone')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(container?.querySelector('input')).toBeNull();
  expect(props.onSetSceneBackground).not.toHaveBeenCalled();
  await clickBackgroundKind('videoEditor.sidebar.sceneBackgroundSolid');
  const { enabled: _disabled, ...active } = retained;
  expect(props.onSetSceneBackground).toHaveBeenLastCalledWith(active);
  await clickBackgroundKind('gallery.videoReview.backgroundNone');
  expect(props.onSetSceneBackground).toHaveBeenLastCalledWith(retained);
  expect(container?.querySelector('input')).toBeNull();
});

it.each(['fixed', 'follow-video'] as const)(
  'keeps saved %s visible until an explicit current zoom mode is selected',
  async (zoomBehavior) => {
    const onSetSceneBackground = vi.fn();
    renderBackgroundHarness({
      ...createProps(),
      onSetSceneBackground,
      sceneBackground: { kind: 'solid', color: '#123456', enabled: false, zoomBehavior },
    });
    expect(container?.textContent).toContain(
      zoomBehavior === 'fixed'
        ? 'gallery.videoReview.backgroundZoomLegacyFixed'
        : 'gallery.videoReview.backgroundZoomLegacyFollow'
    );
    await clickBackgroundKind('gallery.videoReview.backgroundZoomWindow');
    expect(onSetSceneBackground).toHaveBeenLastCalledWith({ zoomBehavior: 'window' });
    expect(container?.textContent).not.toContain('gallery.videoReview.backgroundZoomLegacy');
    await clickBackgroundKind('gallery.videoReview.backgroundZoomContent');
    expect(onSetSceneBackground).toHaveBeenLastCalledWith({ zoomBehavior: 'content' });
    expect(getKindOption('gallery.videoReview.backgroundNone')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
  }
);
