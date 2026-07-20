// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import { updatePointOverlay, updateRectOverlay } from './overlay-editor.helpers';
import { ArrowOverlayEditor, PointOverlayEditor } from './overlay-editor.point-arrow';

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

function runUpdateRectOverlayTest() {
  it('keeps non-rect overlays unchanged in updateRectOverlay', () => {
    const overlay: ScenarioOverlay = {
      id: 'click',
      kind: 'click-ring',
      point: { x: 10, y: 20 },
    };

    expect(updateRectOverlay(overlay, { x: 50 })).toBe(overlay);
  });

  it('updates point overlays through updatePointOverlay', () => {
    expect(
      updatePointOverlay(
        {
          id: 'cursor',
          kind: 'cursor',
          point: { x: 10, y: 20 },
        },
        { x: 12 }
      )
    ).toEqual({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 12, y: 20 },
    });
  });
}

function runPointOverlayEditorTest() {
  it('updates point overlays through direct point editor', async () => {
    const onChange = vi.fn();
    await renderNode(
      <PointOverlayEditor
        overlay={{ id: 'cursor', kind: 'cursor', point: { x: 10, y: 20 } }}
        onChange={onChange}
      />
    );

    const input = queryInput('20');
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, '44');
    });

    expect(onChange).toHaveBeenCalledWith({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 10, y: 44 },
    });
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        point: expect.objectContaining({ x: 44 }),
      })
    );
  });

  it('updates point overlays through the shared point editor x field', async () => {
    const onChange = vi.fn();
    await renderNode(
      <PointOverlayEditor
        overlay={{ id: 'cursor', kind: 'cursor', point: { x: 10, y: 20 } }}
        onChange={onChange}
      />
    );

    await act(async () => {
      setInputValue(queryInput('10')!, '14');
    });

    expect(onChange).toHaveBeenCalledWith({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 14, y: 20 },
    });
  });
}

async function renderArrowOverlayEditor(onChange: OverlayChangeHandler) {
  await renderNode(
    <ArrowOverlayEditor
      overlay={{
        id: 'arrow',
        kind: 'arrow',
        start: { x: 10, y: 20 },
        end: { x: 30, y: 40 },
        color: '#111111',
        strokeWidth: 2,
      }}
      onChange={onChange}
    />
  );
}

async function updateArrowOverlayInputs() {
  await act(async () => {
    setInputValue(queryInput('10')!, '12');
    setInputValue(queryInput('20')!, '22');
    setInputValue(queryInput('30')!, '32');
    setInputValue(queryInput('40')!, '42');
    setInputValue(queryInput('#111111')!, '#222222');
    setInputValue(queryInput('2')!, '4');
  });
}

function expectArrowOverlayUpdates(onChange: ReturnType<typeof vi.fn<OverlayChangeHandler>>) {
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      start: expect.objectContaining({ x: 12 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      start: expect.objectContaining({ y: 22 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      end: expect.objectContaining({ x: 32 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      end: expect.objectContaining({ y: 42 }),
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      color: '#222222',
    })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      strokeWidth: 4,
    })
  );
}

function runArrowOverlayEditorTest() {
  it('updates arrow overlays through coordinate and style editors', async () => {
    const onChange = vi.fn<OverlayChangeHandler>();
    await renderArrowOverlayEditor(onChange);
    await updateArrowOverlayInputs();
    expectArrowOverlayUpdates(onChange);
  });
}

function runScenarioQuickEditOverlayEditorPartsSuite() {
  runUpdateRectOverlayTest();
  runPointOverlayEditorTest();
  runArrowOverlayEditorTest();
}

describe('scenario quick-edit overlay editor parts', runScenarioQuickEditOverlayEditorPartsSuite);
