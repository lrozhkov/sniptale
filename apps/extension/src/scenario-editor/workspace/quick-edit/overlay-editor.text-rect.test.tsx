// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import { RectOverlayEditor, TextOverlayEditor } from './overlay-editor.text-rect';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
type OverlayChangeHandler = (overlay: ScenarioOverlay) => void;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderNode(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<div>{node}</div>);
  });
}

function queryInput(value: string) {
  return container?.querySelector(`input[value="${value}"]`) as HTMLInputElement | null;
}

function createTextOverlay(): Extract<ScenarioOverlay, { kind: 'text' }> {
  return {
    id: 'text',
    kind: 'text',
    point: { x: 10, y: 20 },
    text: 'Hello',
    color: '#111111',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: 400,
  };
}

async function updateTextOverlayInputs() {
  await act(async () => {
    setInputValue(queryInput('10')!, '14');
    setInputValue(queryInput('20')!, '24');
    setInputValue(queryInput('#111111')!, '#222222');
    setInputValue(queryInput('Inter')!, 'Roboto');
    setInputValue(queryInput('16')!, '18');
    setInputValue(queryInput('400')!, '500');
  });
}

function expectTextOverlayUpdates(onChange: ReturnType<typeof vi.fn<OverlayChangeHandler>>) {
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      point: expect.objectContaining({ x: 14 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      point: expect.objectContaining({ y: 24 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      color: '#222222',
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fontFamily: 'Roboto',
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fontSize: 18,
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fontWeight: 500,
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      point: expect.objectContaining({ x: 14, y: 20 }),
    })
  );
}

async function renderRectangleOverlayEditor(onChange: OverlayChangeHandler) {
  await renderNode(
    <RectOverlayEditor
      overlay={{
        id: 'rect',
        kind: 'rectangle',
        rect: { x: 10, y: 20, width: 200, height: 100 },
        strokeColor: '#111111',
        fillColor: '#ffffff',
        strokeWidth: 2,
      }}
      onChange={onChange}
    />
  );
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

function runTextOverlayEditorTest() {
  it('updates text overlays through position and appearance sections', async () => {
    const onChange = vi.fn<OverlayChangeHandler>();
    await renderNode(<TextOverlayEditor overlay={createTextOverlay()} onChange={onChange} />);
    await updateTextOverlayInputs();
    expectTextOverlayUpdates(onChange);
  });
}

function runRectangleFrameOverlayEditorTest() {
  it('updates rectangle frame fields through rect sections', async () => {
    const onRectangleChange = vi.fn<OverlayChangeHandler>();
    await renderRectangleOverlayEditor(onRectangleChange);

    await act(async () => {
      setInputValue(queryInput('10')!, '12');
      setInputValue(queryInput('20')!, '24');
      setInputValue(queryInput('200')!, '240');
      setInputValue(queryInput('100')!, '120');
    });

    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: expect.objectContaining({ x: 12 }),
      })
    );
    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: expect.objectContaining({ y: 24 }),
      })
    );
    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: expect.objectContaining({ width: 240 }),
      })
    );
    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: expect.objectContaining({ height: 120 }),
      })
    );
  });
}

function runRectangleStyleOverlayEditorTest() {
  it('updates rectangle style fields through rect sections', async () => {
    const onRectangleChange = vi.fn<OverlayChangeHandler>();
    await renderRectangleOverlayEditor(onRectangleChange);

    await act(async () => {
      setInputValue(queryInput('#111111')!, '#222222');
      setInputValue(queryInput('#ffffff')!, '#f0f0f0');
      setInputValue(queryInput('2')!, '5');
    });

    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        strokeColor: '#222222',
      })
    );
    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fillColor: '#f0f0f0',
      })
    );
    expect(onRectangleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        strokeWidth: 5,
      })
    );
  });
}

function runBlurOverlayEditorTest() {
  it('updates blur overlays through rect sections', async () => {
    const onBlurChange = vi.fn<OverlayChangeHandler>();
    await renderNode(
      <RectOverlayEditor
        overlay={{
          id: 'blur',
          kind: 'blur-rect',
          rect: { x: 10, y: 20, width: 200, height: 100 },
          blurSettings: { amount: 6, blurType: 'gaussian', showBorder: false },
        }}
        onChange={onBlurChange}
      />
    );

    await act(async () => {
      setInputValue(queryInput('6')!, '9');
    });

    expect(onBlurChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blurSettings: expect.objectContaining({ amount: 9 }),
      })
    );
  });
}

function runScenarioQuickEditOverlayEditorTextRectSuite() {
  runTextOverlayEditorTest();
  runRectangleFrameOverlayEditorTest();
  runRectangleStyleOverlayEditorTest();
  runBlurOverlayEditorTest();
}

describe(
  'scenario quick-edit overlay editor text and rect parts',
  runScenarioQuickEditOverlayEditorTextRectSuite
);
