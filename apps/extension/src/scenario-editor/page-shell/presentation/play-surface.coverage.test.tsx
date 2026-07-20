// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSummary: vi.fn(),
  keyboard: vi.fn(),
  renderSlide: vi.fn(),
  slideFrame: vi.fn(),
  zoomSurface: vi.fn(),
}));

vi.mock('../../project/stage-render/slide', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/stage-render/slide')>()),
  getScenarioSlideBuildStepSummary: (...args: unknown[]) => mocks.buildSummary(...args),
  renderScenarioSlide: (...args: unknown[]) => mocks.renderSlide(...args),
}));

vi.mock('./keyboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./keyboard')>()),
  useScenarioPresentationKeyboard: (props: unknown) => mocks.keyboard(props),
}));

vi.mock('./transition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transition')>()),
  ScenarioPresentationSlideFrame: (props: unknown) => {
    mocks.slideFrame(props);
    return <div data-testid="slide-frame" />;
  },
}));

vi.mock('./zoom-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./zoom-surface')>()),
  ScenarioPresentationZoomSurface: (props: {
    children: (rendered: unknown) => ReactNode;
    rendered: unknown;
  }) => {
    mocks.zoomSurface(props);
    return <div data-testid="zoom-surface">{props.children(props.rendered)}</div>;
  },
}));

import { createScenarioSlide } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { ScenarioDeckPlaySurface } from './play-surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function clickByTitle(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.buildSummary.mockReset();
  mocks.buildSummary.mockReturnValue({ visibleElementIds: ['visible-1'] });
  mocks.keyboard.mockReset();
  mocks.renderSlide.mockReset();
  mocks.renderSlide.mockReturnValue({ rendered: 'slide' });
  mocks.slideFrame.mockReset();
  mocks.zoomSurface.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders navigation and keyboard ownership without an asset map', () => {
  const slide = createScenarioSlide({ clicks: { count: 3, initialIndex: 0 }, title: 'Deck' });
  const onExit = vi.fn();
  const onNext = vi.fn();
  const onPrevious = vi.fn();

  act(() => {
    root?.render(
      <ScenarioDeckPlaySurface
        clickIndex={2}
        onExit={onExit}
        onNext={onNext}
        onPrevious={onPrevious}
        slide={slide}
        slideIndex={1}
        slideTotal={4}
      />
    );
  });

  clickByTitle(translate('scenario.editor.previous'));
  clickByTitle(translate('scenario.editor.next'));

  expect(mocks.keyboard).toHaveBeenCalledWith({ onExit, onNext, onPrevious });
  expect(mocks.renderSlide).toHaveBeenCalledWith(slide, {
    clickIndex: 2,
    mode: 'export',
    outputWidth: 1080,
  });
  expect(mocks.buildSummary).toHaveBeenCalledWith(slide, 2);
  expect(mocks.slideFrame).toHaveBeenCalledWith({
    clickIndex: 2,
    rendered: { rendered: 'slide' },
  });
  expect(container?.textContent).toContain('2/4 · 2/3');
  expect(container?.textContent).toContain('1/0');
  expect(onPrevious).toHaveBeenCalledOnce();
  expect(onNext).toHaveBeenCalledOnce();
});

it('forwards an explicit asset map to the slide renderer', () => {
  const assets = new Map();
  const slide = createScenarioSlide({ title: 'Assets' });

  act(() => {
    root?.render(
      <ScenarioDeckPlaySurface
        assets={assets}
        clickIndex={0}
        onExit={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        slide={slide}
        slideIndex={0}
        slideTotal={1}
      />
    );
  });

  expect(mocks.renderSlide).toHaveBeenLastCalledWith(slide, {
    assets,
    clickIndex: 0,
    mode: 'export',
    outputWidth: 1080,
  });
  expect(container?.querySelector('[data-ui="scenario.editor.v3.play"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="zoom-surface"]')).not.toBeNull();
});
