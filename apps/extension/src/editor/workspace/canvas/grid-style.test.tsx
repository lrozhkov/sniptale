// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useCanvasGridStyle } from './grid-style';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let hookValue: ReturnType<typeof useCanvasGridStyle> | null = null;

function renderGridStyle(props: {
  gridColor: string;
  gridEnabled: boolean;
  gridSize: number;
  zoomPercent: number;
}) {
  function Harness() {
    hookValue = useCanvasGridStyle(props);
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  hookValue = null;
});

function registerDisabledGridStyleTest() {
  it('returns no inline grid style when the workspace grid is disabled', () => {
    renderGridStyle({
      gridColor: '#22c55e',
      gridEnabled: false,
      gridSize: 12,
      zoomPercent: 100,
    });

    expect(hookValue).toBeNull();
  });
}

function registerLargeGridCellStyleTest() {
  it('uses the strongest opacity branch for large rendered cells', () => {
    renderGridStyle({
      gridColor: '#ff0000',
      gridEnabled: true,
      gridSize: 12,
      zoomPercent: 200,
    });

    expect(hookValue).toMatchObject({
      backgroundPosition: '-0.5px -0.5px',
      backgroundSize: '24px 24px',
    });
    expect(hookValue?.backgroundImage).toContain('rgba(255, 0, 0, 0.34)');
  });
}

function registerStandardGridCellStyleTest() {
  it('keeps the medium opacity branch for standard cell sizes', () => {
    renderGridStyle({
      gridColor: '#123456',
      gridEnabled: true,
      gridSize: 12,
      zoomPercent: 125,
    });

    expect(hookValue?.backgroundSize).toBe('15px 15px');
    expect(hookValue?.backgroundImage).toContain('rgba(18, 52, 86, 0.2)');
  });
}

function registerTinyGridCellStyleTest() {
  it('increases density and uses the softest opacity branch for tiny cells', () => {
    renderGridStyle({
      gridColor: '#0ea5e9',
      gridEnabled: true,
      gridSize: 8,
      zoomPercent: 50,
    });

    expect(hookValue?.backgroundSize).toBe('16px 16px');
    expect(hookValue?.backgroundImage).toContain('rgba(14, 165, 233, 0.12)');
  });
}

describe('useCanvasGridStyle', () => {
  registerDisabledGridStyleTest();
  registerLargeGridCellStyleTest();
  registerStandardGridCellStyleTest();
  registerTinyGridCellStyleTest();
});
