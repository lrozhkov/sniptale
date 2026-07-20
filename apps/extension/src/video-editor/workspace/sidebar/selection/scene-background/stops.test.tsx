// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import { GradientStopControls } from './stops';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
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
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders scene gradient as an N-stop editor instead of from/to color fields', () => {
  const markup = renderToStaticMarkup(<GradientStopControls {...createProps()} />);

  expect(markup).toContain('editor.gradient.stop');
  expect(markup).toContain('editor.gradient.addStop');
  expect(markup).toContain('editor.gradient.position');
  expect(markup).toContain('editor.gradient.opacity');
  expect(markup).not.toContain('videoEditor.sidebar.sceneBackgroundFromLabel');
  expect(markup).not.toContain('videoEditor.sidebar.sceneBackgroundToLabel');
});

it('adds a scene gradient stop while preserving endpoints and animation', () => {
  const onSetSceneBackground = vi.fn();
  act(() => {
    root?.render(
      <GradientStopControls {...createProps()} onSetSceneBackground={onSetSceneBackground} />
    );
  });

  act(() => {
    getButton('editor.gradient.addStop')?.click();
  });

  expect(onSetSceneBackground).toHaveBeenCalledWith({
    kind: VideoSceneBackgroundKind.GRADIENT,
    angle: 135,
    from: '#111111',
    to: '#333333',
    stops: [
      { color: '#111111', offset: 0 },
      { color: '#111111', offset: 0.25 },
      { color: '#222222', offset: 0.5 },
      { color: '#333333', offset: 1 },
    ],
    animation: { intensity: 30, mode: 'breathe', speed: 40 },
  });
});

function getButton(label: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.getAttribute('aria-label') === label || button.title === label
  );
}

function createProps() {
  return {
    background: {
      kind: VideoSceneBackgroundKind.GRADIENT,
      angle: 135,
      from: '#111111',
      to: '#333333',
      stops: [
        { color: '#111111', offset: 0 },
        { color: '#222222', offset: 0.5 },
        { color: '#333333', offset: 1 },
      ],
      animation: { intensity: 30, mode: 'breathe' as const, speed: 40 },
    },
    imageAssets: [],
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onSetSceneBackground: vi.fn(),
    recentColors: [],
  };
}
