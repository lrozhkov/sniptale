// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoSceneBackgroundKind,
  VideoSceneGradientAnimationMode,
} from '../../../../../features/video/project/types';
import { GradientAnimationControls, GradientPresetGrid } from './gradient-controls';

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

it('renders scene gradient presets through the shared active preset grid', () => {
  const markup = renderToStaticMarkup(
    <GradientPresetGrid
      {...createGradientProps()}
      background={{
        kind: VideoSceneBackgroundKind.GRADIENT,
        angle: 135,
        from: '#09090b',
        to: '#2563eb',
      }}
    />
  );

  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundPresetLabel');
  expect(markup).toContain('shared.ui.compact-inspector.gradient-preset-field');
  expect(markup).not.toContain('video-editor.selection.compact-field');
  expect(markup).toContain('editor.compact.gradientOcean');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('rounded-[12px]');
});

it('renders long gradient animation modes as a shared select row instead of segmented buttons', () => {
  const markup = renderToStaticMarkup(
    <GradientAnimationControls
      {...createGradientProps()}
      background={{
        kind: VideoSceneBackgroundKind.GRADIENT,
        angle: 135,
        from: '#09090b',
        to: '#2563eb',
      }}
    />
  );

  expect(markup).toContain('videoEditor.sidebar.sceneBackgroundAnimationModeLabel');
  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).not.toContain('shared.ui.compact-inspector.segmented-field');
});

it('applies selected scene gradient presets while preserving animation settings', () => {
  const onSetSceneBackground = vi.fn();

  act(() => {
    root?.render(
      <GradientPresetGrid
        {...createGradientProps()}
        onSetSceneBackground={onSetSceneBackground}
        background={{
          kind: VideoSceneBackgroundKind.GRADIENT,
          angle: 135,
          from: '#09090b',
          to: '#2563eb',
          animation: {
            mode: VideoSceneGradientAnimationMode.BREATHE,
            speed: 42,
            intensity: 24,
          },
        }}
      />
    );
  });

  act(() => {
    container?.querySelector<HTMLButtonElement>('[title="editor.compact.gradientSunset"]')?.click();
  });

  expect(onSetSceneBackground).toHaveBeenCalledWith({
    kind: VideoSceneBackgroundKind.GRADIENT,
    angle: 135,
    from: '#f97316',
    to: '#ec4899',
    stops: [
      { color: '#f97316', offset: 0 },
      { color: '#ec4899', offset: 1 },
    ],
    animation: {
      mode: VideoSceneGradientAnimationMode.BREATHE,
      speed: 42,
      intensity: 24,
    },
  });
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
