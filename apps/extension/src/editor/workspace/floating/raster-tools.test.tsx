// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorRasterTools } from './raster-tools';
import type { RasterSessionSnapshot } from '../../raster-editing/session';
import type { EditorRasterRuntime } from '../../raster-editing/runtime';

let container: HTMLDivElement;
let root: Root;
let snapshot: RasterSessionSnapshot;
const callbacks = new Set<() => void>();
const commands = {
  setTool: vi.fn(),
  updateSettings: vi.fn(),
  setSelectionMethod: vi.fn(),
  setSelectionMode: vi.fn(),
  clearSelection: vi.fn(),
  invertSelection: vi.fn(),
  selectAll: vi.fn(),
  fillSelected: vi.fn(),
  hideSelected: vi.fn(),
  copySelected: vi.fn(),
  applyCrop: vi.fn(),
  cancelCrop: vi.fn(),
  allowContentEditing: vi.fn(),
  flipHorizontal: vi.fn(),
  flipVertical: vi.fn(),
  setCropRatio: vi.fn(),
};
const runtime = {
  ...commands,
  getSnapshot: () => snapshot,
  subscribe: (callback: () => void) => {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  },
} as unknown as EditorRasterRuntime;
const onOpenAdjustments = vi.fn();
function update(change: Partial<RasterSessionSnapshot>) {
  act(() => {
    snapshot = { ...snapshot, ...change };
    for (const callback of callbacks) callback();
  });
}
function button(name: string) {
  return document.querySelector<HTMLButtonElement>(`[data-ui="editor.raster.${name}"]`);
}
function click(name: string) {
  act(() => button(name)?.click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  callbacks.clear();
  snapshot = {
    available: true,
    targetId: 'exact-image',
    targetName: 'Screenshot',
    targetKind: 'image',
    permission: 'allowed',
    tool: null,
    selectionMethod: 'rectangle',
    selectionMode: 'new',
    selection: 'none',
    busy: false,
    error: null,
    cropPending: false,
    cropRatio: 'free',
    settings: {
      tolerance: 5,
      contiguous: true,
      grow: 0,
      brushSize: 32,
      hardness: 100,
      color: '#000000',
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(<EditorRasterTools runtime={runtime} onOpenAdjustments={onOpenAdjustments} />)
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps five tools visible and routes separate flips and exact-target adjustments', () => {
  for (const name of ['select', 'fill', 'removeColor', 'erase', 'crop'])
    expect(button(name)).not.toBeNull();
  click('fill');
  expect(commands.setTool).toHaveBeenCalledWith('fill');
  update({ tool: 'fill' });
  for (const name of ['select', 'fill', 'removeColor', 'erase', 'crop'])
    expect(button(name)).not.toBeNull();
  click('flipHorizontal');
  click('flipVertical');
  click('adjustments');
  expect(commands.flipHorizontal).toHaveBeenCalledOnce();
  expect(commands.flipVertical).toHaveBeenCalledOnce();
  expect(onOpenAdjustments).toHaveBeenCalledWith('exact-image');
  expect(container.querySelector('[data-ui="editor.raster.toolbar"]')?.getAttribute('title')).toBe(
    'Screenshot'
  );
});
it('exposes selection methods, modes and explicit commands without changing the layer', () => {
  update({ tool: 'select', selection: 'active' });
  click('lasso');
  expect(commands.setSelectionMethod).toHaveBeenCalledWith('lasso');
  click('clearSelection');
  click('invertSelection');
  click('copySelected');
  click('hideSelected');
  click('fillSelected');
  expect(commands.clearSelection).toHaveBeenCalledOnce();
  expect(commands.invertSelection).toHaveBeenCalledOnce();
  expect(commands.copySelected).toHaveBeenCalledOnce();
  expect(commands.hideSelected).toHaveBeenCalledOnce();
  expect(commands.fillSelected).toHaveBeenCalledOnce();
});
it('routes crop Apply/Cancel and restores visibility through brush parameters', () => {
  update({ tool: 'crop', cropPending: true });
  click('applyCrop');
  click('cancelCrop');
  expect(commands.applyCrop).toHaveBeenCalledOnce();
  expect(commands.cancelCrop).toHaveBeenCalledOnce();
  update({ tool: 'erase' });
  click('restore');
  expect(commands.setTool).toHaveBeenCalledWith('restore');
});
it('requires explicit content permission and disables duplicate edits while busy', () => {
  update({ permission: 'blocked' });
  expect(button('fill')).toBeNull();
  const allow = container.querySelector('button');
  act(() => allow?.click());
  expect(commands.allowContentEditing).toHaveBeenCalledOnce();
  update({ permission: 'allowed', busy: true });
  click('fill');
  expect(commands.setTool).not.toHaveBeenCalled();
});
it('opens parameters in an anchored portal and dismisses with Escape', () => {
  const disclosure = container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
  act(() => disclosure?.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(disclosure);
});

it('renders compact icon-only selection modes with complete accessible names', () => {
  update({ tool: 'select' });
  for (const mode of ['new', 'add', 'subtract']) {
    const control = container.querySelector<HTMLButtonElement>(
      `[data-ui="editor.raster.selectionMode.${mode}"]`
    );
    expect(control?.querySelector('svg')).not.toBeNull();
    expect(control?.textContent?.trim()).toBe('');
    expect(control?.getAttribute('aria-label')).toBe(control?.getAttribute('title'));
    expect(control?.getAttribute('title')).toBeTruthy();
    expect(control?.classList.contains('!w-7')).toBe(true);
    act(() => control?.click());
    expect(commands.setSelectionMode).toHaveBeenLastCalledWith(mode);
  }
});

it('opens canonical crop ratio choices and publishes the selected ratio', () => {
  update({ tool: 'crop' });
  const control = container.querySelector('[data-ui="editor.raster.cropRatio"]');
  const ratioTrigger = control?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  expect(ratioTrigger).not.toBeNull();
  act(() => ratioTrigger?.click());
  const square = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent?.trim() === '1:1'
  );
  expect(square).toBeDefined();
  act(() => square?.click());
  expect(commands.setCropRatio).toHaveBeenCalledWith('1:1');
});
