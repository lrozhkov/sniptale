/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PopupExportTabItem } from '../selection/tabs/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ExportPagesDrawerList, ExportPagesHeader } from './drawer';
import { WebSnapshotConfirmationDialog } from './snapshot-confirmation';
import { ExportPagesSummary } from './summary';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

async function click(element: Element | null | undefined) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('export pages owner components', () => {
  it('renders both header actions and forwards the filter controls', async () => {
    const setFilterQuery = vi.fn();
    const toggleSelectAllTabs = vi.fn();

    await renderNode(
      <ExportPagesHeader
        filterQuery=""
        selectedCount={2}
        setFilterQuery={setFilterQuery}
        shouldShowClearAll={false}
        toggleSelectAllTabs={toggleSelectAllTabs}
      />
    );

    const input = container?.querySelector<HTMLInputElement>('input');
    if (input) {
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setValue?.call(input, 'needle');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await click(container?.querySelector('button'));

    expect(setFilterQuery).toHaveBeenCalledWith('needle');
    expect(toggleSelectAllTabs).toHaveBeenCalledOnce();
    expect(container?.textContent).toContain('popup.export.selectAllTabsButton');

    await renderNode(
      <ExportPagesHeader
        filterQuery="needle"
        selectedCount={0}
        setFilterQuery={setFilterQuery}
        shouldShowClearAll
        toggleSelectAllTabs={toggleSelectAllTabs}
      />
    );

    expect(container?.textContent).toContain('popup.export.clearAllTabsButton');
  });

  it('renders current, fallback, disabled, and selectable drawer rows', async () => {
    const currentRowRef = { current: null as HTMLLabelElement | null };
    const toggleTabSelection = vi.fn();
    const tabs: PopupExportTabItem[] = [
      {
        disabledReason: null,
        isCurrent: true,
        tabId: 7,
        title: 'Current',
        url: 'https://current.example',
      },
      {
        disabledReason: null,
        isCurrent: false,
        tabId: null,
        title: 'Fallback',
        url: null,
      },
      {
        disabledReason: 'Blocked',
        isCurrent: false,
        tabId: 8,
        title: 'Disabled',
        url: null,
      },
      {
        disabledReason: null,
        isCurrent: false,
        tabId: 9,
        title: 'Selectable',
        url: 'https://selectable.example',
      },
    ];

    await renderNode(
      <ExportPagesDrawerList
        currentRowRef={currentRowRef}
        filteredTabs={tabs}
        selectedTabIds={[7]}
        toggleTabSelection={toggleTabSelection}
      />
    );

    const checkboxes = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
    );
    await click(checkboxes[0]);
    await click(checkboxes[1]);
    await click(checkboxes[3]);

    expect(currentRowRef.current?.textContent).toContain('Current');
    expect(container?.textContent).toContain('popup.export.currentTabBadge');
    expect(container?.textContent).toContain('popup.common.noActiveTab');
    expect(container?.querySelector('label[title="Blocked"] input')?.hasAttribute('disabled')).toBe(
      true
    );
    expect(toggleTabSelection).toHaveBeenCalledWith(7);
    expect(toggleTabSelection).toHaveBeenCalledWith(9);
  });

  it('renders confirmation states and routes dialog actions', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onRememberChoiceChange = vi.fn();
    const disclosure = {
      body: 'Body',
      requiresConfirmation: true,
      title: 'Confirm snapshot',
      warning: 'Warning',
    };

    await renderNode(
      <WebSnapshotConfirmationDialog
        disclosure={disclosure}
        isSavingPreference
        preferenceError="Could not save"
        rememberChoice
        onCancel={onCancel}
        onConfirm={onConfirm}
        onRememberChoiceChange={onRememberChoiceChange}
      />
    );

    const dialog = container?.querySelector('[role="alertdialog"]');
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(container?.textContent).toContain('Could not save');
    expect(onCancel).not.toHaveBeenCalled();

    await renderNode(
      <WebSnapshotConfirmationDialog
        disclosure={disclosure}
        isSavingPreference={false}
        preferenceError={null}
        rememberChoice={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
        onRememberChoiceChange={onRememberChoiceChange}
      />
    );

    const checkbox = container?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await click(checkbox);
    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    await click(buttons[0]);
    await click(buttons[1]);
    await click(buttons[2]);

    expect(onRememberChoiceChange).toHaveBeenCalledWith(true);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(container?.textContent).not.toContain('Could not save');
  });

  it('renders empty and populated summaries and ignores fallback removal', async () => {
    const onRemove = vi.fn();

    await renderNode(<ExportPagesSummary selectedTabs={[]} onRemove={onRemove} />);
    expect(container?.textContent).toContain('popup.export.noSelectedTabs');

    await renderNode(
      <ExportPagesSummary
        selectedTabs={[
          {
            disabledReason: null,
            isCurrent: true,
            tabId: 7,
            title: 'Selected',
            url: 'https://selected.example',
          },
          {
            disabledReason: null,
            favIconUrl: 'https://fallback.example/icon.png',
            isCurrent: false,
            tabId: null,
            title: 'Fallback',
            url: null,
          },
        ]}
        onRemove={onRemove}
      />
    );

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    await click(buttons[0]);
    await click(buttons[1]);

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(7);
    expect(container?.querySelector('[data-testid="export-pages-summary"]')).not.toBeNull();
  });
});
