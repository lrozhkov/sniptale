// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import { SceneBackgroundColorEditor } from './colors';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderEditor() {
  if (!container) {
    throw new Error('missing container');
  }

  act(() => {
    root?.render(
      <SceneBackgroundColorEditor
        imageAssets={[]}
        onPreviewSceneBackground={vi.fn()}
        onRememberRecentColor={vi.fn(async () => undefined)}
        onResetSceneBackgroundPreview={vi.fn()}
        onSetSceneBackground={vi.fn()}
        recentColors={['#654321']}
        sceneBackground={{
          kind: VideoSceneBackgroundKind.SOLID,
          color: '#123456',
        }}
      />
    );
  });
}

function getButton(label: string) {
  return Array.from(document.body.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

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
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace-sidebar/selection/scene-background-colors', () => {
  it('keeps the scene background selector on the shared hex-first trigger chrome', async () => {
    renderEditor();

    expect(container?.textContent).toContain('videoEditor.sidebar.sceneBackgroundColorLabel');
    expect(container?.textContent).toContain('#123456'.toUpperCase());

    await act(async () => {
      getButton('videoEditor.sidebar.sceneBackgroundColorLabel')?.click();
    });

    expect(document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).not.toBeNull();
    expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');
  });
});

vi.mock(
  '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog',
  async () => {
    const { getShowcaseGradient } =
      await import('../../../../../features/highlighter/showcase-resources');
    return {
      useGradientPresetCatalog: () => ({
        presets: [
          {
            id: 'radial',
            name: 'Radial',
            enabled: true,
            gradient: getShowcaseGradient('system-radial-glow'),
          },
        ],
      }),
    };
  }
);

it('previews and cancels a shared preset without committing, then applies once with animation intact', async () => {
  const { createSceneGradientBackground } =
    await import('../../../../../features/video/project/scene/background-gradient');
  const background = createSceneGradientBackground();
  background.animation = { mode: 'breathe', speed: 42, intensity: 24 };
  const commit = vi.fn(),
    preview = vi.fn(),
    reset = vi.fn();
  const remember = vi.fn(async () => undefined);
  act(() =>
    root!.render(
      <SceneBackgroundColorEditor
        imageAssets={[]}
        recentColors={[]}
        sceneBackground={background}
        onSetSceneBackground={commit}
        onPreviewSceneBackground={preview}
        onResetSceneBackgroundPreview={reset}
        onRememberRecentColor={remember}
      />
    )
  );
  const open = () =>
    act(() =>
      container!
        .querySelector<HTMLButtonElement>('[data-ui="shared.ui.paint-selector.trigger"]')!
        .click()
    );
  const preset = () => {
    act(() => getButton('highlighter.paintPicker.presets')!.click());
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-ui="shared.ui.paint-selector.popup"] button[aria-label="Radial"]'
        )!
        .click()
    );
  };
  open();
  preset();
  expect(preview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gradient: expect.objectContaining({ type: 'radial', interpolation: 'oklab' }),
      animation: background.animation,
    })
  );
  expect(commit).not.toHaveBeenCalled();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(reset).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(document.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).toBeNull();
  open();
  preset();
  act(() => getButton('shared.ui.colorSelectorApply')!.click());
  expect(commit).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      gradient: expect.objectContaining({ type: 'radial', interpolation: 'oklab' }),
      animation: background.animation,
    })
  );
  expect(reset).toHaveBeenCalledTimes(2);
  expect(remember).toHaveBeenCalledOnce();
});
