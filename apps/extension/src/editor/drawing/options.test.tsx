// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  colorOptions: vi.fn(
    (props: {
      allowAlpha?: boolean;
      floatingPlacement: string;
      vertical: boolean;
      value: string;
      onPreview?: (color: string) => void;
      onPreviewReset?: (color: string) => void;
      onSelect: (color: string) => void;
    }) => (
      <span
        data-placement={props.floatingPlacement}
        data-alpha={String(props.allowAlpha)}
        data-value={props.value}
        data-ui="mock.color-options"
        data-vertical={String(props.vertical)}
      >
        <button
          type="button"
          data-ui="mock.preview-color"
          onClick={() => props.onPreview?.('#abcdef')}
        />
        <button
          type="button"
          data-ui="mock.apply-color"
          onClick={() => props.onSelect('#abcdef')}
        />
        <button
          type="button"
          data-ui="mock.cancel-color"
          onClick={() => props.onPreviewReset?.(props.value)}
        />
      </span>
    )
  ),
  divider: vi.fn((props: { vertical: boolean }) => (
    <span data-ui="mock.divider" data-vertical={String(props.vertical)} />
  )),
}));

vi.mock('../../ui/drawing-tools/options', () => ({
  ArrowDrawDirectionOption: (props: {
    active: boolean;
    dataUi: string;
    onChange: (value: boolean) => void;
  }) => (
    <button
      type="button"
      data-ui={props.dataUi}
      aria-pressed={props.active}
      onClick={() => props.onChange(!props.active)}
    />
  ),
  ArrowWidthModeOptions: () => <span data-ui="mock.arrow-mode-options" />,
  DrawingColorOptions: mocks.colorOptions,
  DrawingBlurStrengthOptions: (props: { value: number; onChange: (value: number) => void }) => (
    <button
      type="button"
      data-ui="mock.blur-strength"
      data-value={props.value}
      onClick={() => props.onChange(2)}
    />
  ),
  DrawingDeleteOption: () => null,
  DrawingDeselectOption: () => null,
  DrawingOptionsDivider: mocks.divider,
  DrawingShapeFillOptions: () => null,
  DrawingShapeOptions: () => null,
  DrawingTextOptions: () => null,
  DrawingWidthOptions: (props: { tool: string }) => (
    <span data-tool={props.tool} data-ui="mock.width-options" />
  ),
  MarkerOpacityOptions: () => <span data-ui="mock.marker-opacity-options" />,
}));

const storeState = {
  updateDrawingToolSettings: vi.fn(),
  updateSelectionDrawingToolSettings: vi.fn(),
  selectionToolSettings: {},
  toolSettings: {
    blur: { amount: 20 },
    arrow: {
      color: '#333333',
      design: 'standard' as const,
      drawFromTip: false,
      dynamicWidth: false,
      width: 12,
    },
    marker: { color: '#222222', opacity: 0.5, width: 24 },
    pencil: { color: '#111111', width: 4 },
  },
};

it('previews a selected pencil color without committing, then applies it once', async () => {
  storeState.updateDrawingToolSettings.mockClear();
  storeState.updateSelectionDrawingToolSettings.mockClear();
  Object.assign(storeState.selectionToolSettings, storeState.toolSettings);
  const onPreviewSelection = vi.fn();
  const onApplyToSelection = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorDrawingOptions
        onApplyToSelection={onApplyToSelection}
        onPreviewSelection={onPreviewSelection}
        onDirectionChange={vi.fn()}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
        selectedType="pencil"
        tool="pencil"
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="mock.preview-color"]')?.click()
  );
  expect(storeState.updateSelectionDrawingToolSettings).toHaveBeenCalledWith('pencil', {
    color: '#abcdef',
  });
  expect(onPreviewSelection).toHaveBeenCalledOnce();
  expect(onApplyToSelection).not.toHaveBeenCalled();
  expect(storeState.updateDrawingToolSettings).not.toHaveBeenCalled();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="mock.apply-color"]')?.click()
  );
  expect(onApplyToSelection).toHaveBeenCalledOnce();
  expect(storeState.updateDrawingToolSettings).toHaveBeenCalledWith('pencil', {
    color: '#abcdef',
  });
  await act(async () => root.unmount());
});

it('shows legacy marker effective alpha and commits picker color without double opacity', async () => {
  storeState.updateDrawingToolSettings.mockClear();
  storeState.updateSelectionDrawingToolSettings.mockClear();
  storeState.toolSettings.marker = { color: '#ffff00', opacity: 0.3, width: 24 };
  Object.assign(storeState.selectionToolSettings, storeState.toolSettings);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorDrawingOptions
        onApplyToSelection={vi.fn()}
        onPreviewSelection={vi.fn()}
        onDirectionChange={vi.fn()}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
        selectedType="marker"
        tool="marker"
      />
    )
  );
  const picker = host.querySelector<HTMLElement>('[data-ui="mock.color-options"]');
  expect(picker?.dataset['alpha']).toBe('true');
  expect(picker?.dataset['value']).toBe('#ffff004d');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="mock.apply-color"]')?.click()
  );
  expect(storeState.updateDrawingToolSettings).toHaveBeenCalledWith('marker', {
    color: '#abcdef',
    opacity: 1,
  });
  expect(storeState.updateSelectionDrawingToolSettings).toHaveBeenCalledWith('marker', {
    color: '#abcdef',
    opacity: 1,
  });
  await act(async () => root.unmount());
});

it('restores the original marker color and multiplier when picker preview is cancelled', async () => {
  storeState.updateSelectionDrawingToolSettings.mockClear();
  storeState.toolSettings.marker = { color: '#ffff00', opacity: 0.3, width: 24 };
  Object.assign(storeState.selectionToolSettings, storeState.toolSettings);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorDrawingOptions
        onApplyToSelection={vi.fn()}
        onPreviewSelection={vi.fn()}
        onDirectionChange={vi.fn()}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
        selectedType="marker"
        tool="marker"
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="mock.preview-color"]')?.click()
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="mock.cancel-color"]')?.click()
  );
  expect(storeState.updateSelectionDrawingToolSettings).toHaveBeenLastCalledWith('marker', {
    color: '#ffff00',
    opacity: 0.3,
  });
  await act(async () => root.unmount());
});

vi.mock('../state/useEditorStore', () => ({
  useEditorStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  ),
}));

vi.mock('../../composition/persistence/drawing-palette', () => ({
  createDefaultDrawingPaletteState: () => ({ colors: ['#111111', '#ffffff'] }),
  loadDrawingPaletteState: vi.fn(async () => ({ colors: ['#111111', '#ffffff'] })),
  subscribeToDrawingPaletteState: vi.fn(() => vi.fn()),
}));

import { EditorDrawingOptions } from './options';

it('shows strong blur by default and updates its strength', async () => {
  storeState.updateDrawingToolSettings.mockClear();
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorDrawingOptions
        onApplyToSelection={vi.fn()}
        onPreviewSelection={vi.fn()}
        onDirectionChange={vi.fn()}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
        selectedType={null}
        tool="blur"
      />
    )
  );
  const button = host.querySelector<HTMLButtonElement>('[data-ui="mock.blur-strength"]');
  expect(button?.dataset['value']).toBe('20');
  await act(async () => button?.click());
  expect(storeState.updateDrawingToolSettings).toHaveBeenCalledWith('blur', { amount: 2 });
  await act(async () => root.unmount());
});

it('renders editor tool settings as a horizontal toolbar like content drawing mode', () => {
  const markup = renderToStaticMarkup(
    <EditorDrawingOptions
      onApplyToSelection={vi.fn()}
      onPreviewSelection={vi.fn()}
      onDirectionChange={vi.fn()}
      onClearSelection={vi.fn()}
      onDeleteSelection={vi.fn()}
      selectedType={null}
      tool="pencil"
    />
  );

  expect(markup).toContain('flex-row');
  expect(markup).not.toContain('flex-col');
  expect(markup).toContain('overflow-x-auto overflow-y-hidden');
  expect(markup).toContain('[&amp;_button:active]:!transform-none');
  expect(markup).toContain('[&amp;_button:active]:!translate-y-0');
  expect(markup).toContain('data-ui="mock.divider" data-vertical="false"');
  expect(markup).toContain('data-placement="auto" data-alpha="true"');
  expect(markup).toContain('data-ui="mock.color-options" data-vertical="false"');
});

it.each([
  ['pencil', ['mock.width-options', 'mock.color-options']],
  ['marker', ['mock.width-options', 'mock.marker-opacity-options', 'mock.color-options']],
  ['arrow', ['mock.width-options', 'mock.arrow-mode-options', 'mock.color-options']],
] as const)('matches the content left-to-right control order for %s', (tool, expectedOrder) => {
  const markup = renderToStaticMarkup(
    <EditorDrawingOptions
      onApplyToSelection={vi.fn()}
      onPreviewSelection={vi.fn()}
      onDirectionChange={vi.fn()}
      onClearSelection={vi.fn()}
      onDeleteSelection={vi.fn()}
      selectedType={null}
      tool={tool}
    />
  );

  const positions = expectedOrder.map((dataUi) => markup.indexOf(`data-ui="${dataUi}"`));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
});

it('shows the arrow direction toggle and its pressed state beside arrow profiles', () => {
  storeState.toolSettings.arrow.drawFromTip = true;
  const markup = renderToStaticMarkup(
    <EditorDrawingOptions
      onApplyToSelection={vi.fn()}
      onPreviewSelection={vi.fn()}
      onDirectionChange={vi.fn()}
      onClearSelection={vi.fn()}
      onDeleteSelection={vi.fn()}
      selectedType={null}
      tool="arrow"
    />
  );
  expect(markup).toContain('data-ui="editor.drawing.options.arrow.from-tip"');
  expect(markup).toContain('aria-pressed="true"');
  storeState.toolSettings.arrow.drawFromTip = false;
});

it('updates the direction setting and refreshes the canvas mode on toggle', async () => {
  storeState.toolSettings.arrow.drawFromTip = false;
  storeState.updateDrawingToolSettings.mockClear();
  const onDirectionChange = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <EditorDrawingOptions
        onApplyToSelection={vi.fn()}
        onPreviewSelection={vi.fn()}
        onDirectionChange={onDirectionChange}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
        selectedType={null}
        tool="arrow"
      />
    );
  });
  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="editor.drawing.options.arrow.from-tip"]'
  );
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  await act(async () => button?.click());
  expect(storeState.updateDrawingToolSettings).toHaveBeenCalledWith('arrow', {
    drawFromTip: true,
  });
  expect(onDirectionChange).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
