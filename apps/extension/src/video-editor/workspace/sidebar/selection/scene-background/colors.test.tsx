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

    expect(document.body.textContent).toContain('shared.ui.colorSelectorRecentColors');
    expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');
  });
});
