// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  EditorRasterTools,
  EditorRasterProperties,
  EditorRasterSelectionActions,
  RasterToolPropertiesProvider,
} from './raster-tools';
import type { RasterSessionSnapshot } from '../../raster-editing/session';
import type { EditorRasterRuntime } from '../../raster-editing/runtime';

let container: HTMLDivElement;
let root: Root;
let snapshot: RasterSessionSnapshot;
const callbacks = new Set<() => void>();
const commands = {
  setTool: vi.fn(),
  selectTool: vi.fn(),
  enterEditing: vi.fn(),
  finishEditing: vi.fn(),
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
    editing: true,
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
      opacity: 100,
      color: '#000000',
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <RasterToolPropertiesProvider>
        <EditorRasterTools runtime={runtime} onOpenAdjustments={onOpenAdjustments} />
        <EditorRasterProperties runtime={runtime} />
        <EditorRasterSelectionActions runtime={runtime} />
      </RasterToolPropertiesProvider>
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps seven tools visible and routes separate flips and exact-target adjustments', () => {
  for (const name of ['brush', 'select', 'fill', 'removeColor', 'erase', 'restore', 'crop'])
    expect(button(name)).not.toBeNull();
  click('fill');
  expect(commands.selectTool).toHaveBeenCalledWith('fill');
  update({ tool: 'fill' });
  for (const name of ['brush', 'select', 'fill', 'removeColor', 'erase', 'restore', 'crop'])
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
it('keeps selection methods and copy without duplicate pixel edit commands', () => {
  update({ tool: 'select', selection: 'active' });
  click('lasso');
  expect(commands.setSelectionMethod).toHaveBeenCalledWith('lasso');
  click('clearSelection');
  click('invertSelection');
  click('copySelected');
  expect(commands.clearSelection).toHaveBeenCalledOnce();
  expect(commands.invertSelection).toHaveBeenCalledOnce();
  expect(commands.copySelected).toHaveBeenCalledOnce();
  expect(button('hideSelected')).toBeNull();
  expect(button('fillSelected')).toBeNull();
});
it('routes crop Apply/Cancel and restores visibility through brush parameters', () => {
  update({ tool: 'crop', cropPending: true });
  click('applyCrop');
  click('cancelCrop');
  expect(commands.applyCrop).toHaveBeenCalledOnce();
  expect(commands.cancelCrop).toHaveBeenCalledOnce();
  update({ tool: 'erase' });
  click('restore');
  expect(commands.selectTool).toHaveBeenCalledWith('restore');
});
it('requires explicit content permission and guards duplicate edits while busy', () => {
  update({ permission: 'blocked', editing: false });
  expect(button('fill')).toBeNull();
  const allow = container.querySelector('button');
  act(() => allow?.click());
  expect(commands.allowContentEditing).toHaveBeenCalledOnce();
  update({ permission: 'allowed', editing: true, busy: true });
  click('fill');
  expect(commands.selectTool).not.toHaveBeenCalled();
});
it('edits numeric settings in ordinary fields without sliders or popups', () => {
  update({ tool: 'fill' });
  const tolerance = container.querySelector('[data-ui="editor.raster.tolerance"]');
  const field = tolerance?.querySelector<HTMLInputElement>('input[type="text"]');
  expect(field).not.toBeNull();
  expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(tolerance?.querySelector('input[type="range"]')).toBeNull();
  act(() => tolerance?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })));
  expect(tolerance?.querySelector('input[type="range"]')).toBeNull();
  act(() => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, '12');
    field?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(commands.updateSettings).toHaveBeenCalledWith({ tolerance: 12 });
  expect(document.activeElement).not.toBe(field);
});

it('keeps numeric settings and the contiguous toggle interactive while compute is busy', () => {
  update({ tool: 'fill', busy: true });
  const field = container.querySelector<HTMLInputElement>(
    '[data-ui="editor.raster.grow"] input[type="text"]'
  );
  expect(field?.disabled).toBe(false);
  expect(container.querySelector('fieldset[disabled]')).toBeNull();
  const contiguous = button('contiguous');
  expect(contiguous?.getAttribute('aria-pressed')).toBe('true');
  expect(contiguous?.textContent?.trim()).toBe('');
  expect(contiguous?.disabled).toBe(false);
  click('contiguous');
  expect(commands.updateSettings).toHaveBeenCalledWith({ contiguous: false });
  act(() => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, '4');
    field?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(commands.updateSettings).toHaveBeenCalledWith({ grow: 4 });
  update({ tool: 'select', selectionMethod: 'wand' });
  click('lasso');
  expect(commands.setSelectionMethod).toHaveBeenCalledWith('lasso');
});

it('explains selection modifiers instead of adding separate mode buttons', () => {
  update({ tool: 'select' });
  expect(container.querySelector('[data-ui^="editor.raster.selectionMode."]')).toBeNull();
  expect(container.querySelector('[data-ui="editor.raster.selectionModifierHint"]')).toBeNull();
  expect(button('selectAll')).toBeNull();
  for (const name of ['rectangle', 'lasso', 'wand']) {
    expect(button(name)?.title).toContain('Shift');
    expect(button(name)?.title).toContain('Ctrl');
  }
  expect(button('select')?.title).toContain('Shift');
  expect(commands.setSelectionMode).not.toHaveBeenCalled();
});

it('shows only free and original crop ratio buttons with accepted state and no dropdown', () => {
  update({ tool: 'crop', cropRatio: 'free' });
  const group = container.querySelector('[data-ui="editor.raster.cropRatio"]');
  expect(group?.getAttribute('role')).toBe('group');
  expect(group?.querySelector('[aria-haspopup]')).toBeNull();
  expect(group?.querySelectorAll('button')).toHaveLength(2);
  expect(button('freeRatio')?.getAttribute('aria-pressed')).toBe('true');
  expect(button('originalRatio')?.getAttribute('aria-pressed')).toBe('false');
  expect(button('freeRatio')?.title).toMatch(/пропорции|ratio/i);
  expect(button('originalRatio')?.title).toMatch(/пропорции|ratio/i);
  click('originalRatio');
  expect(commands.setCropRatio).toHaveBeenCalledWith('original');
  update({ cropRatio: 'original' });
  expect(button('freeRatio')?.getAttribute('aria-pressed')).toBe('false');
  expect(button('originalRatio')?.getAttribute('aria-pressed')).toBe('true');
  click('freeRatio');
  expect(commands.setCropRatio).toHaveBeenCalledWith('free');
});

it('enters editing explicitly, keeps Cursor separate and exits through its command', () => {
  update({ editing: false });
  expect(button('fill')).toBeNull();
  const entry = button('enter');
  expect(entry?.querySelector('svg')).not.toBeNull();
  expect(entry?.textContent?.trim().length).toBeGreaterThan(1);
  expect(entry?.classList.contains('!w-full')).toBe(true);
  expect(entry?.classList.contains('!h-7')).toBe(true);
  click('enter');
  expect(commands.enterEditing).toHaveBeenCalledOnce();
  update({ editing: true });
  expect(container.querySelector('[data-ui="editor.raster.properties"]')).toBeNull();
  click('cursor');
  expect(commands.selectTool).toHaveBeenCalledWith(null);
  click('exit');
  expect(commands.finishEditing).toHaveBeenCalledOnce();
});
it('keeps an active tool selected when its button is pressed again', () => {
  update({ tool: 'fill' });
  click('fill');
  expect(commands.selectTool).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ui="editor.raster.properties"]')).toBeNull();
  click('fill');
  expect(container.querySelector('[data-ui="editor.raster.properties"]')).not.toBeNull();
});

it('places accepted-selection commands in a separate strip and clears after copy', () => {
  update({ tool: 'select', selection: 'active', selectionMethod: 'wand' });
  const panel = container.querySelector('[data-ui="editor.raster.properties"]');
  const actions = container.querySelector('[data-ui="editor.raster.selection-actions"]');
  expect(panel?.querySelector('[data-ui="editor.raster.invertSelection"]')).toBeNull();
  expect(panel?.querySelector('[data-ui="editor.raster.copySelected"]')).toBeNull();
  expect(panel?.querySelector('[data-ui="editor.raster.clearSelection"]')).toBeNull();
  const buttons = actions?.querySelectorAll('button');
  expect([...(buttons ?? [])].map((control) => control.dataset['ui'])).toEqual([
    'editor.raster.invertSelection',
    'editor.raster.copySelected',
    'editor.raster.clearSelection',
  ]);
  expect(button('invertSelection')?.querySelector('svg')).not.toBeNull();
});

it('hides the action strip without a mask and keeps clear available for a static empty mask', () => {
  update({ tool: 'select', selection: 'none' });
  expect(container.querySelector('[data-ui="editor.raster.selection-actions"]')).toBeNull();
  update({ selection: 'empty' });
  expect(container.querySelector('[data-ui="editor.raster.selection-actions"]')).not.toBeNull();
  expect(button('invertSelection')?.disabled).toBe(true);
  expect(button('copySelected')?.disabled).toBe(true);
  expect(button('clearSelection')?.disabled).toBe(false);
  click('invertSelection');
  click('copySelected');
  expect(commands.invertSelection).not.toHaveBeenCalled();
  expect(commands.copySelected).not.toHaveBeenCalled();
  const actions = container.querySelector('[data-ui="editor.raster.selection-actions"]');
  update({ busy: true });
  expect(container.querySelector('[data-ui="editor.raster.selection-actions"]')).toBe(actions);
  expect(button('invertSelection')?.disabled).toBe(true);
  expect(button('copySelected')?.disabled).toBe(true);
  expect(button('clearSelection')?.disabled).toBe(false);
});

it('guards busy tools and accepted-selection commands without disabling or dimming them', () => {
  update({ tool: 'select', selection: 'active', busy: true });
  for (const name of [
    'fill',
    'flipHorizontal',
    'flipVertical',
    'adjustments',
    'invertSelection',
    'copySelected',
    'clearSelection',
  ]) {
    expect(button(name)?.disabled).toBe(false);
    click(name);
  }
  expect(commands.selectTool).not.toHaveBeenCalled();
  expect(commands.flipHorizontal).not.toHaveBeenCalled();
  expect(commands.flipVertical).not.toHaveBeenCalled();
  expect(onOpenAdjustments).not.toHaveBeenCalled();
  expect(commands.invertSelection).not.toHaveBeenCalled();
  expect(commands.copySelected).not.toHaveBeenCalled();
  expect(commands.clearSelection).not.toHaveBeenCalled();
  expect(
    container.querySelector('[data-ui="editor.raster.toolbar"]')?.getAttribute('aria-busy')
  ).toBe('true');
  expect(
    container
      .querySelector('[data-ui="editor.raster.selection-actions"]')
      ?.getAttribute('aria-busy')
  ).toBe('true');
});

it('places Brush before pixel selection and exposes direct size, hardness, opacity and color controls', () => {
  const tools = [
    ...container.querySelectorAll<HTMLButtonElement>('[data-ui="editor.raster.toolbar"] button'),
  ];
  expect(button('brush')).not.toBeNull();
  expect(tools.indexOf(button('brush')!)).toBeLessThan(tools.indexOf(button('select')!));
  click('brush');
  expect(commands.selectTool).toHaveBeenCalledWith('brush');
  update({ tool: 'brush' });
  expect(button('brush')?.getAttribute('aria-pressed')).toBe('true');
  const properties = container.querySelector('[data-ui="editor.raster.properties"]')!;
  for (const name of ['brushSize', 'hardness', 'opacity']) {
    expect(
      properties.querySelector(`[data-ui="editor.raster.${name}"] input[type="text"]`)
    ).not.toBeNull();
  }
  expect(properties.querySelector('.editor-raster-color')).not.toBeNull();
  expect(properties.querySelector('input[type="range"]')).toBeNull();
  const opacity = properties.querySelector<HTMLInputElement>(
    '[data-ui="editor.raster.opacity"] input[type="text"]'
  )!;
  act(() => {
    opacity.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(opacity, '40');
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => opacity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(commands.updateSettings).toHaveBeenCalledWith({ opacity: 40 });
});
