// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasInsertToolPanel, createCommonCanvasPointInsertAction } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('creates shared canvas-point insert actions and routes the editor-specific target', () => {
  const onSelect = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <CanvasInsertToolPanel
        dataUi="shared.canvas.insert"
        label="Insert"
        actions={[
          createCommonCanvasPointInsertAction({
            active: true,
            kind: 'text',
            label: 'Text',
            target: 'scenario-text',
            onSelect,
          }),
        ]}
      />
    );
  });

  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="shared.canvas.insert.text"]'
  );
  expect(button?.getAttribute('aria-pressed')).toBe('true');

  act(() => button?.click());

  expect(onSelect).toHaveBeenCalledWith('scenario-text');
});
