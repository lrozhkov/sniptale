// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact raster inspector proof keeps active, empty, and fill-update branches together */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';

const controllerMocks = vi.hoisted(() => ({
  clearRasterSelection: vi.fn(),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useOptionalEditorController: () => controllerMocks,
}));

import {
  RasterBrushControlsSection,
  RasterEraserControlsSection,
  RasterFillControlsSection,
  RasterSelectionControlsSection,
} from './raster';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

function cleanupDom() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
}

describe('inspector/tools raster', () => {
  beforeEach(() => {
    cleanupDom();
    vi.clearAllMocks();
    useEditorStore.setState({
      rasterToolSettings: {
        brushColor: '#ea580c',
        brushHardness: 0.85,
        brushOpacity: 1,
        brushSize: 24,
        selectionMode: 'marquee',
        eraserSize: 24,
        fillMode: 'bucket',
        fillColor: '#112233',
        gradientFrom: '#112233',
        gradientStops: [
          { color: '#112233', offset: 0 },
          { color: '#ffffff', offset: 1 },
        ],
        gradientTo: '#ffffff',
      },
      rasterSelection: {
        hasSelection: true,
        targetLayerId: 'layer-1',
        targetLayerName: 'Layer 1',
      },
    });
  });

  it('renders selection and eraser sections with active selection status', async () => {
    await renderNode(<RasterSelectionControlsSection />);
    expect(container?.textContent).toContain('Layer 1');
    cleanupDom();

    await renderNode(<RasterEraserControlsSection />);
    expect(container?.textContent).toContain('Layer 1');
  });

  it('renders brush size, color, opacity, and hardness controls', async () => {
    await renderNode(<RasterBrushControlsSection />);

    expect(container?.textContent).toContain('Размер кисти');
    expect(container?.textContent).toContain('Цвет кисти');
    expect(container?.textContent).toContain('Прозрачность');
    expect(container?.textContent).toContain('Жесткость');
    expect(
      container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.numeric-row"]')
    ).toHaveLength(3);
    expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).not.toBeNull();

    cleanupDom();
  });

  it('omits the selection status block when no raster selection is active', async () => {
    useEditorStore.setState({
      rasterSelection: {
        hasSelection: false,
        targetLayerId: null,
        targetLayerName: null,
      },
    });

    await renderNode(<RasterSelectionControlsSection />);
    expect(container?.textContent).not.toContain('Очистить выделение');
    cleanupDom();
  });

  it('uses the active-selection fallback label when the target layer has no display name', async () => {
    useEditorStore.setState({
      rasterSelection: {
        hasSelection: true,
        targetLayerId: 'layer-1',
        targetLayerName: null,
      },
    });

    await renderNode(<RasterSelectionControlsSection />);
    expect(container?.textContent).toContain('Маска активна');
    cleanupDom();
  });

  it('renders bucket and gradient fill variants', async () => {
    await renderNode(<RasterFillControlsSection />);
    expect(container?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(1);
    cleanupDom();

    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        fillMode: 'linear-gradient',
      },
    });

    await renderNode(<RasterFillControlsSection />);
    expect(container?.textContent).toContain('Линейный градиент');
    expect(container?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(1);
    expect(container?.textContent).toContain('Прозрачность');
    cleanupDom();
  });

  it('renders segmented mode controls for selection and fill instead of dropdown selects', async () => {
    await renderNode(<RasterSelectionControlsSection />);
    expect(container?.querySelector('[aria-label="Режим выделения"][role="group"]')).not.toBeNull();
    expect(container?.querySelector('.sniptale-select')).toBeNull();
    cleanupDom();

    await renderNode(<RasterFillControlsSection />);
    expect(container?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBeTruthy();
    expect(container?.querySelector('.sniptale-select')).toBeNull();
    cleanupDom();
  });

  it('does not duplicate the active selection mode in the header and wraps long mode labels', async () => {
    await renderNode(<RasterSelectionControlsSection />);

    expect(container?.textContent?.match(/Прямоугольник/g)).toHaveLength(1);
    const modeButtons = Array.from(
      container?.querySelectorAll('[aria-label="Режим выделения"][role="group"] button') ?? []
    );
    expect(modeButtons).toHaveLength(3);
    modeButtons.forEach((button) => {
      expect(button.className).toContain('whitespace-normal');
      expect(button.className).toContain('h-auto');
      expect(button.className).toContain('leading-tight');
    });

    cleanupDom();
  });

  it('keeps the fill mode value in the header', async () => {
    await renderNode(<RasterFillControlsSection />);

    expect(container?.textContent?.match(/Заливка/g)?.length).toBeGreaterThanOrEqual(2);

    cleanupDom();
  });

  it('forwards clear-selection through the store-owned controls', async () => {
    await renderNode(<RasterSelectionControlsSection />);
    const clearButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('Очистить выделение')
    );
    clearButton?.click();
    expect(controllerMocks.clearRasterSelection).toHaveBeenCalledOnce();
    cleanupDom();
  });

  it('falls back to raw mode values when the store carries unsupported raster enums', async () => {
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        fillMode: 'custom-fill' as never,
        selectionMode: 'custom-selection' as never,
      },
    });

    await renderNode(<RasterSelectionControlsSection />);
    expect(container?.textContent).toContain('custom-selection');
    cleanupDom();

    await renderNode(<RasterFillControlsSection />);
    expect(container?.textContent).toContain('custom-fill');
    cleanupDom();
  });
});
