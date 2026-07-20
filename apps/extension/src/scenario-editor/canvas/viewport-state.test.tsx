// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScenarioCanvasViewport } from './viewport-state';

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

it('fits canvas zoom against disposable viewport insets', () => {
  renderViewportProbe('resolver');
  expect(getProbe()?.dataset['scale']).toBe('0.55');
  expect(getProbe()?.dataset['left']).toBe('336');

  renderViewportProbe('static');
  expect(getProbe()?.dataset['scale']).toBe('0.93');
  expect(getProbe()?.dataset['left']).toBe('32');

  renderViewportProbe('none');
  expect(getProbe()?.dataset['scale']).toBe('1');
  expect(getProbe()?.dataset['left']).toBe('');
});

function renderViewportProbe(insetMode: 'none' | 'resolver' | 'static') {
  act(() => {
    root?.render(<ViewportProbe insetMode={insetMode} />);
  });
}

function getProbe(): HTMLDivElement | null {
  return container?.querySelector<HTMLDivElement>('[data-testid="viewport-probe"]') ?? null;
}

function ViewportProbe(props: { insetMode: 'none' | 'resolver' | 'static' }) {
  const viewport = useScenarioCanvasViewport(
    { height: 900, width: 1600 },
    props.insetMode === 'none'
      ? {}
      : {
          fitInsets:
            props.insetMode === 'static'
              ? { bottom: 32, left: 32, right: 32, top: 32 }
              : () => ({ bottom: 176, left: 336, right: 384, top: 96 }),
        }
  );

  return (
    <div
      ref={viewport.viewportRef}
      data-left={viewport.viewportInsets?.left ?? ''}
      data-scale={viewport.scale}
      data-testid="viewport-probe"
    />
  );
}
