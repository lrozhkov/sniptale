// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioQuickEditOverlayPointFields } from './overlay-editor.point-fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

describe('scenario quick-edit overlay point fields', () => {
  it('updates x and y through the shared point-field seam', async () => {
    const onChange = vi.fn();

    await act(async () => {
      root?.render(
        <ScenarioQuickEditOverlayPointFields
          overlay={{ id: 'cursor', kind: 'cursor', point: { x: 10, y: 20 } }}
          onChange={onChange}
        />
      );
    });

    const xInput = container?.querySelector('input[value="10"]') as HTMLInputElement | null;
    const yInput = container?.querySelector('input[value="20"]') as HTMLInputElement | null;

    await act(async () => {
      setInputValue(xInput!, '12');
      setInputValue(yInput!, '24');
    });

    expect(onChange).toHaveBeenCalledWith({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 12, y: 20 },
    });
    expect(onChange).toHaveBeenCalledWith({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 10, y: 24 },
    });
  });
});
