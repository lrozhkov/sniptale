// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CompactSelect } from '../../../ui/compact-inspector-controls';
import { initializeContentUiRoots } from '../../platform/dom-host';

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
}));

import { startDesignReviewPicker, type DesignReviewPickerRuntime } from './picker';

function makeVisible<T extends Element>(element: T): T {
  const rect = DOMRect.fromRect({ height: 32, width: 96, x: 20, y: 30 });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  return element;
}

let pickerRuntime: DesignReviewPickerRuntime | null = null;
let reactRoot: Root | null = null;

afterEach(() => {
  pickerRuntime?.dispose();
  pickerRuntime = null;
  act(() => reactRoot?.unmount());
  reactRoot = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('keeps a real CompactSelect option inside the Design Review inspector boundary', async () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  document.body.append(contentHost);
  initializeContentUiRoots(contentRoot);

  const popover = document.createElement('aside');
  popover.dataset['ui'] = 'content.design-review.popover';
  const mount = document.createElement('div');
  popover.append(mount);
  contentRoot.append(popover);

  const selected = makeVisible(document.createElement('button'));
  document.body.append(selected);
  const onInspectorDismissRequested = vi.fn(() => true);
  const onChange = vi.fn();
  pickerRuntime = startDesignReviewPicker({
    onDisableRequested: vi.fn(),
    onInspectorDismissRequested,
    onSelection: vi.fn(),
  });
  expect(pickerRuntime.selectElement(selected)).toBe(true);

  reactRoot = createRoot(mount);
  act(() => {
    reactRoot?.render(
      <CompactSelect
        aria-label="Display"
        onChange={onChange}
        options={[
          { label: 'Block', value: 'block' },
          { label: 'Inline', value: 'inline' },
        ]}
        value="block"
      />
    );
  });
  const trigger = contentRoot.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]');
  act(() => trigger?.click());
  const option = [...contentRoot.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.includes('Inline')
  );

  expect(option).toBeDefined();
  await act(async () => {
    option?.click();
    await Promise.resolve();
  });

  expect(onChange).toHaveBeenCalledWith('inline');
  expect(onInspectorDismissRequested).not.toHaveBeenCalled();
});
