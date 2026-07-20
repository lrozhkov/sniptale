// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioLineElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioInspectorPanel } from './panel';
import type { ScenarioInspectorElementPatch } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('preserves selected layer while a bounded numeric stepper repeats updates', () => {
  vi.useFakeTimers();
  const line = {
    ...createScenarioLineElement({ name: 'Selected line', strokeWidth: 4 }),
    id: 'line-1',
  };
  const image = { ...createScenarioImageElement({ name: 'Screenshot' }), id: 'image-1' };

  renderHarness(line, image);
  repeatStrokeWidthIncrease();

  expect(
    container!.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('scenario.editor.strokeWidth')}"]`
    )?.value
  ).toBe('25');
  expect(
    Array.from(container!.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]')).some(
      (button) => button.title === 'Selected line'
    )
  ).toBe(true);
});

function Harness(props: { initialElements: ScenarioElement[] }) {
  const [elements, setElements] = useState<ScenarioElement[]>(props.initialElements);

  return (
    <ScenarioInspectorPanel
      elements={elements}
      selectedElementId="line-1"
      {...createCallbacks()}
      onUpdateElement={(elementId, patch) => {
        setElements((current) => applyElementPatch(current, elementId, patch));
      }}
    />
  );
}

function renderHarness(...initialElements: ScenarioElement[]): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<Harness initialElements={initialElements} />);
  });
}

function repeatStrokeWidthIncrease(): void {
  const increase = container!.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('scenario.editor.strokeWidth')} increase"]`
  );

  act(() => {
    increase?.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(220);
    for (let index = 0; index < 20; index += 1) {
      vi.advanceTimersByTime(70);
    }
    window.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });
}

function applyElementPatch(
  elements: ScenarioElement[],
  elementId: string,
  patch: ScenarioInspectorElementPatch
) {
  return elements.map((element) =>
    element.id === elementId && element.kind === 'line' && patch.strokeWidth !== undefined
      ? { ...element, strokeWidth: patch.strokeWidth }
      : element
  );
}

function createCallbacks() {
  return {
    onDeleteElement: vi.fn(),
    onMoveElement: vi.fn(),
    onSelectElement: vi.fn(),
    onUpdateElement: vi.fn(),
  };
}

function createPointerEvent(type: string, init: PointerEventInit & { pointerType?: string } = {}) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  const event = new PointerEventCtor(type, init);
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', {
    configurable: true,
    value: init.pointerType ?? 'mouse',
  });
  return event;
}
