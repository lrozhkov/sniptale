// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSceneGradientBackground } from '../../../../../features/video/project/scene/background-gradient';
import { GradientAnimationControls } from './gradient-controls';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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

it('renders long gradient animation modes as a shared select row instead of segmented buttons', () => {
  const markup = renderToStaticMarkup(
    <GradientAnimationControls
      {...createGradientProps()}
      background={createSceneGradientBackground()}
    />
  );

  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundAnimationModeLabel');
  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).not.toContain('shared.ui.compact-inspector.segmented-field');
});

function createGradientProps() {
  return {
    imageAssets: [],
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onSetSceneBackground: vi.fn(),
    recentColors: [],
  };
}
