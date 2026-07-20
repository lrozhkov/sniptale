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

it('renders selected scene background labels through canonical inspector selects', () => {
  const markup = renderToStaticMarkup(<SceneBackgroundFields {...createProps()} />);

  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundTypeLabel');
  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundImage');
  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundImageAssetLabel');
  expect(markup).toContain('Background Two');
});

it('keeps image kind selected after clicking image when image assets exist', () => {
  const onSetSceneBackground = vi.fn();

  renderBackgroundHarness({
    ...createProps(),
    onSetSceneBackground,
    sceneBackground: {
      kind: VideoSceneBackgroundKind.SOLID,
      color: '#111111',
    },
  });
  clickBackgroundKind('videoEditor.sidebar.sceneBackgroundImage');

  expect(onSetSceneBackground).toHaveBeenCalledWith({
    kind: VideoSceneBackgroundKind.IMAGE,
    assetId: 'asset-1',
  });
  expect(getSelectTrigger('videoEditor.sidebar.sceneBackgroundTypeLabel')?.textContent).toContain(
    'videoEditor.sidebar.sceneBackgroundImage'
  );
});

it('disables image kind when no image assets are available', () => {
  renderBackgroundHarness({
    ...createProps(),
    imageAssets: [],
    sceneBackground: {
      kind: VideoSceneBackgroundKind.SOLID,
      color: '#111111',
    },
  });

  openSelect('videoEditor.sidebar.sceneBackgroundTypeLabel');

  expect(getOption('videoEditor.sidebar.sceneBackgroundImage')?.disabled).toBe(true);
});

function getSelectTrigger(label: string) {
  return container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function openSelect(label: string) {
  const trigger = getSelectTrigger(label);
  expect(trigger).not.toBeNull();
  act(() => {
    trigger?.click();
  });
}

function getOption(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
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
        setSceneBackground(nextBackground);
      }}
    />
  );
}

function renderBackgroundHarness(props: SceneBackgroundFieldProps) {
  act(() => {
    root?.render(<SceneBackgroundHarness {...props} />);
  });
}

function clickBackgroundKind(label: string) {
  openSelect('videoEditor.sidebar.sceneBackgroundTypeLabel');
  const option = getOption(label);
  expect(option).not.toBeNull();
  act(() => {
    option?.click();
  });
}
