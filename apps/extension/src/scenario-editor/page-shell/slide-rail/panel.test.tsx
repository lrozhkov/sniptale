// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../../features/scenario/project/v3/templates';
import { translate } from '../../../platform/i18n';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import { ScenarioSlideRail } from './panel';
import { moveScenarioSlideByDirection } from './reorder';
import type { ScenarioSlideRailProps } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSlides() {
  const image = createScenarioImageElement({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    build: { hideAtClick: null, order: 1, showAtClick: 1 },
    name: 'Captured app',
  });

  return [
    {
      ...createScenarioSlide({
        clicks: { count: 2, initialIndex: 0 },
        elements: [image],
        title: 'Intro',
      }),
      id: 'slide-1',
    },
    { ...createScenarioSlide({ title: 'Details' }), id: 'slide-2' },
  ];
}

const assets: ScenarioSlideRenderAssetMap = new Map([
  [
    'asset-1',
    {
      height: 720,
      source: [
        'data:image/png;base64,',
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      ].join(''),
      width: 1280,
    },
  ],
]);

function renderRail(assetMap: ScenarioSlideRenderAssetMap | undefined = assets) {
  const onAddSlide = vi.fn();
  const onCreateTemplateSlide = vi.fn();
  const onDeleteSlide = vi.fn();
  const onDuplicateSlide = vi.fn();
  const onMoveSlide = vi.fn();
  const onOpenTemplateManager = vi.fn();
  const onSelectSlide = vi.fn();
  const onToggleTemplatePicker = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioSlideRail
        assets={assetMap}
        onAddSlide={onAddSlide}
        onCreateTemplateSlide={onCreateTemplateSlide}
        onDeleteSlide={onDeleteSlide}
        onDuplicateSlide={onDuplicateSlide}
        onMoveSlide={onMoveSlide}
        onOpenTemplateManager={onOpenTemplateManager}
        onSelectSlide={onSelectSlide}
        onToggleTemplatePicker={onToggleTemplatePicker}
        selectedSlideId="slide-2"
        slides={createSlides()}
        templatePickerOpen={false}
        templates={listBundledScenarioTemplates()}
      />
    );
  });

  return {
    onAddSlide,
    onCreateTemplateSlide,
    onDeleteSlide,
    onDuplicateSlide,
    onMoveSlide,
    onOpenTemplateManager,
    onSelectSlide,
    onToggleTemplatePicker,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

describe('scenario v3 slide rail', () => {
  registerSlideActionTests();
  registerTemplatePickerTests();
  registerThumbnailTests();
  registerReorderTests();
});

function registerSlideActionTests() {
  it('exposes slide add, select, duplicate, delete, and reorder actions', () => {
    const {
      onAddSlide,
      onDeleteSlide,
      onDuplicateSlide,
      onMoveSlide,
      onSelectSlide,
      onToggleTemplatePicker,
    } = renderRail();

    act(() => {
      clickByLabel(translate('scenario.editor.layouts'));
      clickByLabel(translate('scenario.editor.addSlide'));
      clickByLabel(translate('scenario.editor.moveSlideUp'));
      clickByLabel(translate('scenario.editor.duplicateSlide'));
      clickByLabel(translate('scenario.editor.deleteSlide'));
      container?.querySelector<HTMLButtonElement>('button.grid')?.click();
    });

    expect(onToggleTemplatePicker).toHaveBeenCalledTimes(1);
    expect(onAddSlide).toHaveBeenCalledTimes(1);
    expect(onMoveSlide).toHaveBeenCalledWith('slide-1', 'up');
    expect(onDuplicateSlide).toHaveBeenCalledWith('slide-1');
    expect(onDeleteSlide).toHaveBeenCalledWith('slide-1');
    expect(onSelectSlide).toHaveBeenCalledWith('slide-1');
  });
}

function registerTemplatePickerTests() {
  it('opens layouts inside the slide rail and creates slides from templates', () => {
    const onCreateTemplateSlide = vi.fn();
    const onOpenTemplateManager = vi.fn();
    const onToggleTemplatePicker = vi.fn();

    renderRailWithTemplates({
      onCreateTemplateSlide,
      onOpenTemplateManager,
      onToggleTemplatePicker,
    });

    act(() => {
      clickByLabel(translate('scenario.editor.layouts'));
      clickByLabel(translate('scenario.editor.templateManagerOpen'));
      clickByText(translate('scenario.editor.newSlideFromTemplate'));
    });

    const picker = container?.querySelector<HTMLElement>('[data-ui="scenario.templates.picker"]');

    expect(picker).not.toBeNull();
    expect(picker?.className).not.toContain('sniptale-dropdown-menu');
    expect(container?.textContent).toContain(
      translate('scenario.editor.templateScreenshotFocusLabel')
    );
    expect(onToggleTemplatePicker).toHaveBeenCalledTimes(1);
    expect(onOpenTemplateManager).toHaveBeenCalledTimes(1);
    expect(onCreateTemplateSlide).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'screenshot-focus' })
    );
  });
}

function registerThumbnailTests() {
  it('renders thumbnails with resolved assets and presentation indicators', () => {
    renderRail();
    const thumbnail = container?.querySelector<HTMLImageElement>(
      `img[alt="${translate('scenario.editor.slideThumbnailAlt')}"]`
    );

    expect(thumbnail?.src).toContain('data:image/svg+xml');
    expect(decodeURIComponent(thumbnail?.src ?? '')).toContain('data:image/png;base64');
    expect(container?.textContent).toContain(translate('scenario.editor.transitionFade'));
    expect(container?.textContent).toContain('1/2');
  });

  it('renders missing image placeholders through thumbnail rendering', () => {
    renderRail(new Map());
    const thumbnail = container?.querySelector<HTMLImageElement>(
      `img[alt="${translate('scenario.editor.slideThumbnailAlt')}"]`
    );
    const decodedThumbnail = decodeURIComponent(thumbnail?.src ?? '');

    expect(decodedThumbnail).toContain('data-scenario-element-kind="image"');
    expect(decodedThumbnail).not.toContain(translate('scenario.editor.missingImage'));
  });
}

function registerReorderTests() {
  it('moves slides by direction without mutating the source array', () => {
    const slides = createSlides();
    const moved = moveScenarioSlideByDirection({
      direction: 'down',
      slideId: 'slide-1',
      slides,
    });

    expect(moved.map((slide) => slide.id)).toEqual(['slide-2', 'slide-1']);
    expect(slides.map((slide) => slide.id)).toEqual(['slide-1', 'slide-2']);
    expect(moveScenarioSlideByDirection({ direction: 'up', slideId: 'slide-1', slides })).toBe(
      slides
    );
  });
}

function renderRailWithTemplates(args: {
  onCreateTemplateSlide: ScenarioSlideRailProps['onCreateTemplateSlide'];
  onOpenTemplateManager: () => void;
  onToggleTemplatePicker: () => void;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioSlideRail
        assets={assets}
        onAddSlide={vi.fn()}
        onCreateTemplateSlide={args.onCreateTemplateSlide}
        onDeleteSlide={vi.fn()}
        onDuplicateSlide={vi.fn()}
        onMoveSlide={vi.fn()}
        onOpenTemplateManager={args.onOpenTemplateManager}
        onSelectSlide={vi.fn()}
        onToggleTemplatePicker={args.onToggleTemplatePicker}
        selectedSlideId="slide-2"
        slides={createSlides()}
        templatePickerOpen
        templates={listBundledScenarioTemplates()}
      />
    );
  });
}

function clickByLabel(label: string) {
  container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
}

function clickByText(text: string) {
  Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    .find((button) => button.textContent?.trim() === text)
    ?.click();
}
