// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorStore } from '../../state/useEditorStore';
import { EDITOR_RASTER_FILL_MODE } from '../../state/raster-tools';
import {
  RasterBrushControlsSection,
  RasterEraserControlsSection,
  RasterFillControlsSection,
  RasterSelectionControlsSection,
} from './raster';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function setInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  field.focus();
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function createPointerEvent(type: string) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  return new PointerEventCtor(type, { bubbles: true, pointerId: 1 } as PointerEventInit);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function setupRasterNumericState() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useEditorStore.setState({
    rasterToolSettings: {
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      selectionMode: 'marquee',
      eraserSize: 28,
      fillMode: EDITOR_RASTER_FILL_MODE.BUCKET,
      fillColor: '#111827',
      gradientFrom: '#111827',
      gradientStops: [
        { color: '#111827', offset: 0 },
        { color: '#ffffff', offset: 1 },
      ],
      gradientTo: '#ffffff',
    },
  });
}

function renderRasterNumericSections() {
  render(
    <div>
      <RasterEraserControlsSection />
      <RasterBrushControlsSection />
      <RasterFillControlsSection />
      <RasterSelectionControlsSection />
    </div>
  );
}

function updateRasterNumericFields(fields: HTMLInputElement[]) {
  ['24', '32', '64', '72'].forEach((value, index) => {
    const field = fields[index];
    if (field) {
      setInputValue(field, value);
    }
  });
}

function clickRasterNumericSteppers() {
  container
    ?.querySelectorAll<HTMLButtonElement>('button[aria-label$="increase"]')
    .forEach((button) => {
      button.dispatchEvent(createPointerEvent('pointerdown'));
      button.dispatchEvent(createPointerEvent('pointerup'));
    });
}

it('commits raster brush and eraser numeric rows from input editing', () => {
  setupRasterNumericState();
  renderRasterNumericSections();

  const fields = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
  );
  expect(fields.length).toBeGreaterThanOrEqual(4);

  act(() => {
    updateRasterNumericFields(fields);
    clickRasterNumericSteppers();
  });

  expect(useEditorStore.getState().rasterToolSettings).toMatchObject({
    brushHardness: 0.73,
    brushOpacity: 0.65,
    brushSize: 33,
    eraserSize: 25,
  });
});

it('renders alternate raster mode branches', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useEditorStore.setState((state) => ({
    rasterToolSettings: {
      ...state.rasterToolSettings,
      fillMode: EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT,
      selectionMode: 'custom-mode' as never,
    } as never,
  }));

  render(
    <div>
      <RasterFillControlsSection />
      <RasterSelectionControlsSection />
    </div>
  );

  expect(container?.textContent).toContain('custom-mode');
});
