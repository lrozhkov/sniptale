import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../state/useEditorStore';
import {
  buildRasterBrushCompactCommands,
  buildRasterEraserCompactCommands,
  buildRasterFillCompactCommands,
  buildRasterSelectionCompactCommands,
} from './raster';

beforeEach(() => {
  useEditorStore.setState({
    rasterToolSettings: {
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      eraserSize: 24,
      fillMode: 'bucket',
      fillColor: '#112233',
      gradientFrom: '#112233',
      gradientStops: [
        { color: '#112233', offset: 0 },
        { color: '#ffffff', offset: 1 },
      ],
      gradientTo: '#ffffff',
      selectionMode: 'marquee',
    },
    rasterSelection: {
      hasSelection: true,
      targetLayerId: 'layer-1',
      targetLayerName: 'Layer 1',
    },
  } as never);
});

function findPropsWithKey<T extends string>(
  node: ReactNode,
  key: T
): (Record<T, unknown> & { children?: ReactNode }) | null {
  if (!isValidElement(node)) {
    return null;
  }

  const props = node.props as Record<T, unknown> & { children?: ReactNode };
  if (props[key]) {
    return props;
  }

  if (Array.isArray(props.children)) {
    for (const child of props.children) {
      const found = findPropsWithKey(child, key);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return findPropsWithKey(props.children, key);
}

it('renders brush compact commands for size, color, opacity, hardness, and selection clear', () => {
  const clearRasterSelection = vi.fn();
  const commands = buildRasterBrushCompactCommands({ clearRasterSelection });

  expect(commands.map((command) => command.id)).toEqual([
    'raster-brush-size',
    'raster-brush-color',
    'raster-brush-opacity',
    'raster-brush-hardness',
    'raster-brush-clear',
  ]);

  ((commands[0]?.content as any).props.children.props.onPreviewValue as (value: number) => void)(
    64
  );
  ((commands[2]?.content as any).props.children.props.onPreviewValue as (value: number) => void)(
    50
  );
  commands[4]?.onClick?.();

  expect(useEditorStore.getState().rasterToolSettings.brushSize).toBe(64);
  expect(useEditorStore.getState().rasterToolSettings.brushOpacity).toBe(0.5);
  expect(clearRasterSelection).toHaveBeenCalledOnce();
});

it('renders raster selection mode icons and routes mode changes through the store', () => {
  const clearRasterSelection = vi.fn();
  const commands = buildRasterSelectionCompactCommands({ clearRasterSelection });
  const content = renderToStaticMarkup(<>{commands[0]?.content}</>);

  expect(commands.map((command) => command.id)).toEqual([
    'raster-selection-mode',
    'raster-selection-clear',
  ]);
  expect(content).toContain('role="group"');
  expect(content).toContain('span');
  ((commands[0]?.content as any).props.children.props.onChange as (value: string) => void)('lasso');
  commands[1]?.onClick?.();

  expect(useEditorStore.getState().rasterToolSettings.selectionMode).toBe('lasso');
  expect(clearRasterSelection).toHaveBeenCalledOnce();
});

it('renders eraser size as a compact numeric control', () => {
  const commands = buildRasterEraserCompactCommands({});
  const control = (commands[0]?.content as any).props.children.props;

  control.onPreviewValue(48);

  expect(commands[0]?.value).toBe('24');
  expect(renderToStaticMarkup(<>{commands[0]?.trigger}</>)).toContain('24px');
  expect(useEditorStore.getState().rasterToolSettings.eraserSize).toBe(48);
});

it('renders raster fill mode icons and keeps clear action separate', () => {
  const clearRasterSelection = vi.fn();
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      fillMode: 'linear-gradient',
    },
  } as never);
  const commands = buildRasterFillCompactCommands({ clearRasterSelection });
  const markup = renderToStaticMarkup(<>{commands[0]?.content}</>);

  expect(commands.map((command) => command.id)).toEqual([
    'raster-fill-mode',
    'raster-fill-gradient',
    'raster-fill-selection',
  ]);
  expect(markup).toContain('role="group"');
  expect(renderToStaticMarkup(<>{commands[0]?.trigger}</>)).toContain('span');
  ((commands[0]?.content as any).props.children.props.onChange as (value: string) => void)(
    'bucket'
  );
  commands[2]?.onClick?.();

  expect(useEditorStore.getState().rasterToolSettings.fillMode).toBe('bucket');
  expect(clearRasterSelection).toHaveBeenCalledOnce();
});

it('updates compact raster gradient stops with legacy color fallbacks', () => {
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      fillMode: 'linear-gradient',
    },
  } as never);
  const commands = buildRasterFillCompactCommands({});
  const gradientCommand = commands.find((command) => command.id === 'raster-fill-gradient');
  const gradientControl = findPropsWithKey(gradientCommand?.content, 'onStopsChange') as {
    onStopsChange: (stops: []) => void;
  } | null;

  gradientControl?.onStopsChange([]);

  expect(gradientControl).not.toBeNull();
  expect(useEditorStore.getState().rasterToolSettings.gradientStops).toEqual([]);
  expect(useEditorStore.getState().rasterToolSettings.gradientFrom).toBe('#112233');
  expect(useEditorStore.getState().rasterToolSettings.gradientTo).toBe('#ffffff');
});

it('renders raster bucket color command and updates fill color', () => {
  const commands = buildRasterFillCompactCommands({});
  const colorCommand = commands.find((command) => command.id === 'raster-fill-color');
  const colorControl = findPropsWithKey(colorCommand?.content, 'onChange') as {
    onChange: (value: string) => void;
  } | null;

  colorControl?.onChange('#abcdef');

  expect(commands.map((command) => command.id)).toEqual([
    'raster-fill-mode',
    'raster-fill-color',
    'raster-fill-selection',
  ]);
  expect(colorControl).not.toBeNull();
  expect(useEditorStore.getState().rasterToolSettings.fillColor).toBe('#abcdef');
});
