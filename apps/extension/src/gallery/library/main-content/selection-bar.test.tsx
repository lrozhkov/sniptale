// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

import { GallerySelectionBar } from './selection-bar';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function updateInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) {
    throw new Error('Expected native input value setter');
  }

  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function createProps(overrides: Partial<Parameters<typeof GallerySelectionBar>[0]> = {}) {
  return {
    allTags: ['draft-tag'],
    onApplySelectionTag: vi.fn(),
    onClearSelection: vi.fn(),
    onDeleteMany: vi.fn(),
    onSelectionTagDraftChange: vi.fn(),
    onSelectionBackup: vi.fn(),
    onSelectionZip: vi.fn(),
    selectedItems: [],
    selectedSize: 0,
    selectionTagDraft: '',
    ...overrides,
  };
}

function renderSelectionBar(props: Parameters<typeof GallerySelectionBar>[0]) {
  act(() => {
    root?.render(<GallerySelectionBar {...props} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('stays hidden when nothing is selected', () => {
  renderSelectionBar(createProps());
  expect(container?.textContent).toBe('');
});

it('renders selected-state actions and forwards callbacks', () => {
  const selectedItems = [createMediaItem({ id: 'asset-1' }), createMediaItem({ id: 'asset-2' })];
  const props = createProps({
    selectedItems,
    selectedSize: 512,
    selectionTagDraft: 'draft-tag',
  });

  renderSelectionBar(props);

  const input = container?.querySelector('input');
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const backupButton = buttons.find(
    (button) => button.getAttribute('aria-label') === 'gallery.app.selectionBackup'
  );
  const zipButton = buttons.find((button) => button.getAttribute('aria-label') === 'ZIP');
  const deleteButton = buttons.find(
    (button) => button.getAttribute('aria-label') === 'common.actions.delete'
  );
  const clearButton = buttons.find(
    (button) => button.getAttribute('aria-label') === 'gallery.app.clearSelection'
  );

  if (!input || !backupButton || !zipButton || !deleteButton || !clearButton) {
    throw new Error('Expected selection bar controls');
  }

  const selectionBar = input.closest('.flex-nowrap');
  expect(selectionBar?.className).toContain('flex-nowrap');
  expect(backupButton.className).toContain('!h-8');
  expect(backupButton.className).toContain('!min-h-8');
  expect(backupButton.className).toContain('!rounded-[8px]');
  expect(Array.from(selectionBar?.children ?? []).indexOf(clearButton)).toBeLessThan(
    Array.from(selectionBar?.children ?? []).indexOf(backupButton)
  );

  act(() => updateInputValue(input, 'updated-tag'));
  renderSelectionBar({ ...props, selectionTagDraft: 'updated-tag' });

  const updatedInput = container?.querySelector('input');
  if (!(updatedInput instanceof HTMLInputElement)) {
    throw new Error('Expected updated selection tag input');
  }
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'gallery.app.apply'
  );
  if (!(applyButton instanceof HTMLButtonElement)) {
    throw new Error('Expected explicit apply-tag action');
  }

  act(() => {
    updatedInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(props.onApplySelectionTag).not.toHaveBeenCalled();

  act(() => {
    applyButton.click();
    backupButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.onSelectionTagDraftChange).toHaveBeenCalled();
  expect(props.onApplySelectionTag).toHaveBeenCalledWith('updated-tag');
  expect(props.onSelectionBackup).toHaveBeenCalledTimes(1);
  expect(props.onSelectionZip).toHaveBeenCalledTimes(1);
  expect(props.onDeleteMany).toHaveBeenCalledWith(selectedItems);
  expect(props.onClearSelection).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain('gallery.app.selectedPrefix 2');
  expect(container?.textContent).toContain('gallery.app.sizePrefix');
});

it('supports missing tag catalog while keeping selection actions available', () => {
  const baseProps = createProps({
    selectedItems: [createMediaItem({ id: 'asset-1' })],
    selectedSize: 128,
  });
  const { allTags: _allTags, ...props } = baseProps;

  renderSelectionBar(props);

  const zipButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('ZIP')
  );

  if (!(zipButton instanceof HTMLButtonElement)) {
    throw new Error('Expected ZIP action');
  }

  act(() => {
    zipButton.click();
  });

  expect(props.onSelectionZip).toHaveBeenCalledTimes(1);
  expect(container?.querySelector('input')).not.toBeNull();
});
