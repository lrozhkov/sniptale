// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScenarioQuickEditOverlayEditor,
  getOverlayKindLabel,
} from './ScenarioQuickEditOverlayEditor';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderEditor(props: Parameters<typeof ScenarioQuickEditOverlayEditor>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioQuickEditOverlayEditor {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createClickOverlay() {
  return { id: 'click', kind: 'click-ring' as const, point: { x: 10, y: 20 } };
}

function createTextOverlay() {
  return {
    id: 'text',
    kind: 'text' as const,
    point: { x: 10, y: 20 },
    text: 'Hello',
    color: '#111111',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: 400,
  };
}

function createRectOverlay() {
  return {
    id: 'rect',
    kind: 'rectangle' as const,
    rect: { x: 10, y: 20, width: 200, height: 100 },
    strokeColor: '#111111',
    fillColor: '#ffffff',
    strokeWidth: 2,
  };
}

function runPointOverlayTest() {
  it('routes point overlays through point fields', async () => {
    const onChange = vi.fn();
    await renderEditor({
      overlay: createClickOverlay(),
      onChange,
    });

    const input = container?.querySelector('input[value="10"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, '33');
    });

    expect(onChange).toHaveBeenCalledWith({
      id: 'click',
      kind: 'click-ring',
      point: { x: 33, y: 20 },
    });
  });
}

function runTextOverlayTest() {
  it('routes text overlays through text-specific fields', async () => {
    const onChange = vi.fn();
    await renderEditor({
      overlay: createTextOverlay(),
      onChange,
    });

    const input = container?.querySelector('input[value="Hello"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, 'Updated');
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'text',
        kind: 'text',
        text: 'Updated',
      })
    );
  });
}

function runRectOverlayTest() {
  it('updates rect-based overlays through rect helpers', async () => {
    const onChange = vi.fn();
    await renderEditor({
      overlay: createRectOverlay(),
      onChange,
    });

    const input = container?.querySelector('input[value="200"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, '240');
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rect',
        kind: 'rectangle',
        rect: expect.objectContaining({ width: 240 }),
      })
    );
  });
}

function runLabelHelperTest() {
  it('returns translated overlay labels through helper seam', () => {
    expect(getOverlayKindLabel('click-ring')).toBeTruthy();
  });
}

function runScenarioQuickEditOverlayEditorSuite() {
  runPointOverlayTest();
  runTextOverlayTest();
  runRectOverlayTest();
  runLabelHelperTest();
}

describe('ScenarioQuickEditOverlayEditor', runScenarioQuickEditOverlayEditorSuite);
