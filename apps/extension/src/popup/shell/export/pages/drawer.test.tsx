// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExportPagesDrawerList, ExportPagesHeader } from './drawer';
import type { PopupExportTabItem } from '../selection/tabs/types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('edits the Pages filter with a neutral focus border and retains both selection commands', async () => {
  const toggleSelectAllTabs = vi.fn();
  function Header() {
    const [query, setQuery] = useState('');
    return (
      <ExportPagesHeader
        filterQuery={query}
        setFilterQuery={setQuery}
        selectedCount={2}
        shouldShowClearAll={query.length > 0}
        toggleSelectAllTabs={toggleSelectAllTabs}
      />
    );
  }
  await act(async () => root.render(<Header />));
  const input = container.querySelector<HTMLInputElement>('input')!;
  const initialCommand = container.querySelector('button')!.textContent;
  expect(input.className).toContain('focus:border-[var(--sniptale-color-text-secondary)]');
  expect(input.className).not.toContain('focus:border-[var(--sniptale-color-accent)]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'page');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe('page');
  expect(container.querySelector('button')!.textContent).not.toBe(initialCommand);
  await act(async () => container.querySelector('button')!.click());
  expect(toggleSelectAllTabs).toHaveBeenCalledOnce();
});

it('keeps circular neutral native checks selectable through their labels and preserves unavailable pages', async () => {
  const currentRowRef = { current: null as HTMLLabelElement | null };
  const toggleTabSelection = vi.fn();
  const tabs: PopupExportTabItem[] = [
    {
      tabId: 7,
      title: 'Current',
      url: 'https://current.example',
      isCurrent: true,
      disabledReason: null,
    },
    {
      tabId: 8,
      title: 'Other',
      url: 'https://other.example',
      isCurrent: false,
      disabledReason: null,
    },
    { tabId: 9, title: 'Blocked', url: null, isCurrent: false, disabledReason: 'Unavailable' },
    { tabId: null, title: 'Fallback', url: null, isCurrent: false, disabledReason: null },
  ];
  function Pages() {
    const [selected, setSelected] = useState([7]);
    return (
      <ExportPagesDrawerList
        currentRowRef={currentRowRef}
        filteredTabs={tabs}
        selectedTabIds={selected}
        toggleTabSelection={(tabId) => {
          toggleTabSelection(tabId);
          setSelected((previous) =>
            previous.includes(tabId)
              ? previous.filter((value) => value !== tabId)
              : [...previous, tabId]
          );
        }}
      />
    );
  }
  await act(async () => root.render(<Pages />));
  const labels = container.querySelectorAll('label');
  const checks = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(currentRowRef.current).toBe(labels[0]);
  expect(checks[0]!.checked).toBe(true);
  for (const checkbox of checks) {
    expect(checkbox.classList.contains('sniptale-checkbox')).toBe(true);
    expect(checkbox.classList.contains('rounded-full!')).toBe(true);
    expect(checkbox.closest('.sniptale-ai-modal-adopted')).not.toBeNull();
    expect(checkbox.classList.contains('focus-visible:outline-2')).toBe(true);
  }
  await act(async () => {
    labels[0]!.click();
    labels[1]!.click();
    labels[2]!.click();
    labels[3]!.click();
  });
  expect(checks[0]!.checked).toBe(false);
  expect(checks[1]!.checked).toBe(true);
  expect(checks[2]!.disabled).toBe(true);
  expect(checks[3]!.disabled).toBe(true);
  expect(toggleTabSelection.mock.calls).toEqual([[7], [8]]);
});
