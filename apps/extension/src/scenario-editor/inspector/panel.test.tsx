// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_INSPECTOR_WIDTH_CLASS_NAME } from './layout';
import { ScenarioInspectorPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createInspectorElements(): ScenarioElement[] {
  const text = {
    ...createScenarioTextElement({
      frame: { height: 80, width: 280, x: 100, y: 120 },
      name: 'Title',
      text: 'Hello',
    }),
    id: 'text-1',
  };
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      name: 'Screenshot',
    }),
    id: 'image-1',
  };

  return [text, image];
}

function renderInspector(
  args: {
    selectedElementId?: string | null;
    slide?: ScenarioSlide;
  } = {}
) {
  const onDeleteElement = vi.fn();
  const onEditImageElement = vi.fn();
  const onMoveElement = vi.fn();
  const onSelectElement = vi.fn();
  const onUpdateSlide = vi.fn();
  const onUpdateElement = vi.fn();
  const selectedElementId =
    args.selectedElementId === undefined ? 'text-1' : args.selectedElementId;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioInspectorPanel
        elements={createInspectorElements()}
        onDeleteElement={onDeleteElement}
        onEditImageElement={onEditImageElement}
        onMoveElement={onMoveElement}
        onSelectElement={onSelectElement}
        onUpdateSlide={onUpdateSlide}
        onUpdateElement={onUpdateElement}
        selectedElementId={selectedElementId}
        {...(args.slide ? { slide: args.slide } : {})}
      />
    );
  });

  return {
    onDeleteElement,
    onEditImageElement,
    onMoveElement,
    onSelectElement,
    onUpdateElement,
    onUpdateSlide,
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

function changeInput(label: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input).toBeDefined();
  if (!input) {
    throw new Error('Expected inspector input');
  }

  act(() => {
    setNativeFieldValue(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

function setNativeFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  setter?.call(field, value);
}

it('commits common element fields and text-specific fields', () => {
  const { onUpdateElement } = renderInspector({ selectedElementId: 'text-1' });
  const textArea = container?.querySelector<HTMLTextAreaElement>('textarea');

  expect(container?.querySelector('[data-ui="scenario.inspector.panel"]')?.className).toContain(
    SCENARIO_INSPECTOR_WIDTH_CLASS_NAME
  );
  changeInput(translate('scenario.editor.name'), 'Renamed title');
  changeInput('X', '140');
  changeInput('Y', '160');
  changeInput('Width', '320');
  changeInput('Height', '96');
  act(() => {
    if (!textArea) {
      throw new Error('Expected text field');
    }
    setNativeFieldValue(textArea, 'Updated text');
    textArea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { name: 'Renamed title' });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { frame: { x: 140 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { frame: { y: 160 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { frame: { width: 320 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { frame: { height: 96 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { text: 'Updated text' });
});

it('offers image fit and content transform controls', () => {
  const { onEditImageElement, onUpdateElement } = renderInspector({ selectedElementId: 'image-1' });
  const fitSelect = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('scenario.editor.imageFit')}"]`
  );

  act(() => {
    if (!fitSelect) {
      throw new Error('Expected fit select');
    }
    fitSelect.click();
  });
  act(() => {
    findOption(translate('scenario.editor.imageFitCover'))?.click();
  });
  changeInput(translate('scenario.editor.contentScale'), '1.5');
  act(() => {
    clickButtonText(translate('scenario.editor.editImage'));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('image-1', { fit: 'cover' });
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1.5 },
  });
  expect(onEditImageElement).toHaveBeenCalledWith('image-1');
});

function findOption(label: string) {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes(label));
}

it('commits slide title, notes, and canvas fields when no element is selected', () => {
  const slide = createScenarioSlide({
    canvas: { background: { color: '#ffffff', kind: 'solid' }, height: 720, width: 1280 },
    notes: 'Initial notes',
    title: 'Intro',
  });
  const { onUpdateSlide } = renderInspector({ selectedElementId: null, slide });
  const textArea = container?.querySelector<HTMLTextAreaElement>('textarea');

  changeInput(translate('scenario.editor.fieldTitle'), 'Opening');
  changeInput(translate('scenario.editor.width'), '1440');
  act(() => {
    if (!textArea) {
      throw new Error('Expected slide notes field');
    }
    setNativeFieldValue(textArea, 'Speaker notes');
    textArea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  expect(onUpdateSlide).toHaveBeenCalledWith({ title: 'Opening' });
  expect(onUpdateSlide).toHaveBeenCalledWith({ canvas: { width: 1440 } });
  expect(onUpdateSlide).toHaveBeenCalledWith({ notes: 'Speaker notes' });
});

it('commits slide presentation controls when no element is selected', () => {
  const slide = createScenarioSlide({ title: 'Intro' });
  const { onUpdateSlide } = renderInspector({ selectedElementId: null, slide });

  openSelect(translate('scenario.editor.transition'));
  act(() => {
    findOption(translate('scenario.editor.transitionFade'))?.click();
  });
  openSelect(translate('scenario.editor.backgroundTransition'));
  act(() => {
    findOption(translate('scenario.editor.transitionZoom'))?.click();
  });
  changeInput(translate('scenario.editor.clicks'), '3');

  expect(onUpdateSlide).toHaveBeenCalledWith({
    transition: { durationMs: 420, easing: 'ease', kind: 'fade' },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({
    backgroundTransition: { durationMs: 420, easing: 'ease', kind: 'zoom' },
  });
  expect(onUpdateSlide).toHaveBeenCalledWith({ clicks: { count: 3 } });
});

it('commits element build and animation controls for selected elements', () => {
  const { onUpdateElement } = renderInspector({ selectedElementId: 'text-1' });

  changeInput(translate('scenario.editor.showAtClick'), '1');
  changeInput(translate('scenario.editor.hideAtClick'), '4');
  changeInput(translate('scenario.editor.order'), '2');
  openSelect(translate('scenario.editor.animation'));
  act(() => {
    findOption(translate('scenario.editor.animationFadeUp'))?.click();
  });

  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { build: { showAtClick: 1 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { build: { hideAtClick: 4 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { build: { order: 2 } });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', { animation: { preset: 'fade-up' } });
});

function openSelect(label: string) {
  const select = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  act(() => {
    if (!select) {
      throw new Error(`Expected select: ${label}`);
    }
    select.click();
  });
}

function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  button?.click();
}
