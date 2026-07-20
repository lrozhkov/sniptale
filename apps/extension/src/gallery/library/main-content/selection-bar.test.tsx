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
  const applyButton = buttons.find((button) => button.textContent?.includes('common.actions.add'));
  const zipButton = buttons.find((button) => button.textContent?.includes('ZIP'));
  const deleteButton = buttons.find((button) =>
    button.textContent?.includes('common.actions.delete')
  );
  const clearButton = buttons.find((button) =>
    button.textContent?.includes('gallery.app.clearSelection')
  );

  if (!input || !applyButton || !zipButton || !deleteButton || !clearButton) {
    throw new Error('Expected selection bar controls');
  }

  act(() => {
    updateInputValue(input, 'updated-tag');
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.onSelectionTagDraftChange).toHaveBeenCalled();
  expect(props.onApplySelectionTag).toHaveBeenCalledTimes(1);
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
