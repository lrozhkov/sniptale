import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  EditorFloatingLayersNavigation,
  resolveEditorLayersPanelMode,
} from './layers-panel-navigation';

vi.mock('../../inspector/layers/file-input', () => ({
  LayerInsertImageControl: () => (
    <button type="button" data-ui="mock.insert-image">
      insert
    </button>
  ),
}));

it('maps only owned settings inspectors into the unified layers panel', () => {
  expect(resolveEditorLayersPanelMode('tool')).toBe('layers');
  expect(resolveEditorLayersPanelMode('layer-effects')).toBe('layers');
  expect(resolveEditorLayersPanelMode('workspace')).toBe('layers');
  expect(resolveEditorLayersPanelMode('frame')).toBe('frame');
  expect(resolveEditorLayersPanelMode('browser-frame')).toBe('browser-frame');
  expect(resolveEditorLayersPanelMode('meta')).toBe('meta');
  expect(resolveEditorLayersPanelMode('image-size')).toBe('image-size');
  expect(resolveEditorLayersPanelMode('canvas-size')).toBe('canvas-size');
});

it('keeps every mode and immediate image action available when collapsed', () => {
  const markup = renderToStaticMarkup(
    <EditorFloatingLayersNavigation activeMode="meta" collapsed onSelectMode={vi.fn()} />
  );

  expect(markup).toContain('role="toolbar"');
  expect(markup).toContain('editor.floating.layers.mode.layers');
  expect(markup).toContain('editor.floating.layers.mode.frame');
  expect(markup).toContain('editor.floating.layers.mode.browser-frame');
  expect(markup).toContain('editor.floating.layers.mode.meta');
  expect(markup).toContain('editor.floating.layers.mode.image-size');
  expect(markup).toContain('editor.floating.layers.mode.canvas-size');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('insert');
  expect(markup).toContain('pointer-events-auto flex shrink-0 items-center');
  expect(markup).toContain('flex-row rounded-[14px]');
  expect(markup).not.toContain('editor.floating.layers.collapse-button');
  expectToolbarOrder(markup, false);
});

it('keeps the canonical header order when expanded', () => {
  const markup = renderToStaticMarkup(
    <EditorFloatingLayersNavigation
      activeMode="layers"
      onCollapse={vi.fn()}
      onSelectMode={vi.fn()}
    />
  );

  expectToolbarOrder(markup, true);
  expect(markup).toContain('editor.floating.layers.collapse-button');
});

function expectToolbarOrder(markup: string, includeCollapse: boolean) {
  const selectors = [
    'editor.floating.layers.mode.layers',
    'mock.insert-image',
    'editor.floating.layers.mode.frame',
    'editor.floating.layers.mode.browser-frame',
    'editor.floating.layers.mode.meta',
    'editor.floating.layers.mode.image-size',
    'editor.floating.layers.mode.canvas-size',
    ...(includeCollapse ? ['editor.floating.layers.collapse-button'] : []),
  ];
  const positions = selectors.map((selector) => markup.indexOf(selector));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
}
