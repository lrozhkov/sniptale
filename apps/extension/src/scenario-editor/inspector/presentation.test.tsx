// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3, createScenarioSlide } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { SlideInspector } from './slide';

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

it('commits deck default presentation controls through the inspector', () => {
  const onUpdatePresentation = vi.fn();
  const onUpdateSlide = vi.fn();
  renderSlideInspector({ onUpdatePresentation, onUpdateSlide });

  selectOption(translate('scenario.editor.theme'), translate('scenario.editor.themeGraphite'));
  selectOption(
    translate('scenario.editor.defaultLayout'),
    translate('scenario.editor.templateSummaryLabel')
  );
  selectOption(
    translate('scenario.editor.transition'),
    translate('scenario.editor.transitionFade')
  );
  selectOption(
    translate('scenario.editor.backgroundTransition'),
    translate('scenario.editor.transitionZoom')
  );
  clickButtonContaining(translate('scenario.editor.showPlayControls'));
  clickButtonContaining(translate('scenario.editor.showProgress'));
  clickButtonContaining(translate('scenario.editor.loopPlayback'));
  commitInputByLabel(translate('scenario.editor.gridColumns'), '8');

  expect(onUpdatePresentation).toHaveBeenCalledWith({ themeId: 'graphite' });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ defaultLayoutId: 'summary' });
  expect(onUpdatePresentation).toHaveBeenCalledWith({
    transition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
  expect(onUpdatePresentation).toHaveBeenCalledWith({
    backgroundTransition: { durationMs: 420, easing: 'ease', kind: 'zoom' },
  });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ controls: { showControls: false } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ controls: { showProgress: false } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ controls: { loop: true } });
  expect(onUpdatePresentation).toHaveBeenCalledWith({ grid: { columns: 8 } });
});

it('commits slide layout, presentation, and canvas controls through the inspector', () => {
  const onUpdatePresentation = vi.fn();
  const onUpdateSlide = vi.fn();
  renderSlideInspector({ onUpdatePresentation, onUpdateSlide });

  selectOption(
    translate('scenario.editor.layout'),
    translate('scenario.editor.templateCodeFocusLabel')
  );
  selectOption(
    translate('scenario.editor.compositionPreset'),
    translate('scenario.editor.compositionTechnicalFocus')
  );
  selectOption(
    translate('scenario.editor.transition'),
    translate('scenario.editor.transitionSlide'),
    1
  );
  selectOption(
    translate('scenario.editor.backgroundTransition'),
    translate('scenario.editor.transitionFade'),
    1
  );
  commitInputByLabel(translate('scenario.editor.clicks'), '3');
  commitInputByLabel(translate('scenario.editor.width'), '1440');
  commitInputByLabel(translate('scenario.editor.height'), '900');
  selectOption(
    translate('scenario.editor.background'),
    translate('scenario.editor.backgroundTransparent')
  );

  expect(onUpdateSlide).toHaveBeenCalledWith({
    layout: expect.objectContaining({ layoutId: 'code-focus' }),
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    layout: expect.objectContaining({ compositionPreset: 'technical-focus' }),
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    transition: { durationMs: 420, easing: 'ease', kind: 'slide' },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    backgroundTransition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({ clicks: { count: 3 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({ canvas: { width: 1440 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({ canvas: { height: 900 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    canvas: { background: { kind: 'transparent' } },
  });
});

it('renders transparent canvas and explicit slide transition state', () => {
  const onUpdatePresentation = vi.fn();
  const onUpdateSlide = vi.fn();
  renderSlideInspector({
    onUpdatePresentation,
    onUpdateSlide,
    slide: createScenarioSlide({
      backgroundTransition: { durationMs: 1, easing: 'ease', kind: 'zoom' },
      canvas: { background: { kind: 'transparent' }, height: 720, width: 1280 },
      transition: { durationMs: 1, easing: 'ease', kind: 'fade' },
    }),
  });

  expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).toBeNull();
  expect(container?.textContent).toContain(translate('scenario.editor.transitionFade'));
  expect(container?.textContent).toContain(translate('scenario.editor.transitionZoom'));

  renderSlideInspector({
    onUpdatePresentation,
    onUpdateSlide,
    slide: createScenarioSlide({
      backgroundTransition: null,
      canvas: { background: { kind: 'transparent' }, height: 720, width: 1280 },
      transition: null,
    }),
  });

  expect(container?.textContent).toContain(translate('scenario.editor.transitionNone'));
});

function renderSlideInspector(args: {
  onUpdatePresentation: NonNullable<Parameters<typeof SlideInspector>[0]['onUpdatePresentation']>;
  onUpdateSlide: Parameters<typeof SlideInspector>[0]['onUpdateSlide'];
  slide?: Parameters<typeof SlideInspector>[0]['slide'];
}) {
  const project = createScenarioProjectV3('Presentation');
  act(() => {
    root?.render(
      <SlideInspector
        presentation={project.presentation}
        slide={args.slide ?? createScenarioSlide({ title: 'Intro' })}
        onUpdatePresentation={args.onUpdatePresentation}
        onUpdateSlide={args.onUpdateSlide}
      />
    );
  });
}

function selectOption(label: string, optionLabel: string, index = 0) {
  const select = Array.from(
    container?.querySelectorAll<HTMLButtonElement>(`[aria-label="${label}"]`) ?? []
  )[index];
  expect(select).toBeDefined();
  act(() => select?.click());
  act(() => {
    findOption(optionLabel)?.click();
  });
}

function findOption(label: string) {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes(label));
}

function commitInputByLabel(label: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input).toBeDefined();
  act(() => {
    if (!input) {
      throw new Error('Expected inspector input');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

function clickButtonContaining(text: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(text)
  );
  expect(button).toBeDefined();
  act(() => button?.click());
}
