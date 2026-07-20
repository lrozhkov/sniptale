import { renderToStaticMarkup } from 'react-dom/server';
import type React from 'react';
import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { RichShapeTailSection } from '../../tools/rich-shape/tail';
import { buildRichShapeCompactCommands } from './rich-shape';

it('builds capability-driven rich shape compact groups from the selected object', () => {
  const params = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & { richShapeSelection: ReturnType<typeof createDefaultRichShapeObject> };
  params.richShapeSelection = createDefaultRichShapeObject({
    rough: { ...createDefaultRichShapeObject().rough, enabled: true, fillColor: '#ffeeaa' },
    shapeKind: 'rectangle',
  });
  const commands = buildRichShapeCompactCommands(params as never);
  const markup = renderToStaticMarkup(
    <>
      {commands.map((command) => (
        <span key={command.id}>{command.trigger}</span>
      ))}
    </>
  );

  expect(commands.map((command) => command.id)).toEqual([
    'rich-shape-line',
    'rich-shape-fill',
    'rich-shape-text',
    'rich-shape-effects',
  ]);
  expect(markup).toContain('#ffeeaa');
  expect(markup).toContain('data-color-icon-underline=""');
  expect(commands.every((command) => command.content !== undefined)).toBe(true);
});

it('adds the tail command only for dynamic callout rich shapes', () => {
  const params = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & { richShapeSelection: ReturnType<typeof createDefaultRichShapeObject> };
  const baseShape = createDefaultRichShapeObject({
    frame: { left: 0, top: 0, width: 120, height: 80 },
  });
  params.richShapeSelection = createDefaultRichShapeObject({
    ...baseShape,
    callout: {
      body: { left: 0, top: 20, width: 120, height: 60 },
      tail: {
        side: 'top',
        baseStartRatio: 0.4,
        baseEndRatio: 0.6,
        tip: { x: 60, y: 0 },
      },
    },
    shapeKind: 'dynamic-callout',
  });

  const commands = buildRichShapeCompactCommands(params as never);
  const tail = commands.find((command) => command.id === 'rich-shape-tail');

  expect(commands.map((command) => command.id)).toContain('rich-shape-tail');
  expect(tail?.trigger).toBeTruthy();
  expect(renderToStaticMarkup(<>{tail?.content}</>)).toContain('Сверху');
});

it('renders full tail controls for dynamic callouts and omits static rich shapes', () => {
  const params = createInspectorCommandParams();
  const shape = createDefaultRichShapeObject({
    callout: {
      body: { left: 0, top: 20, width: 120, height: 60 },
      tail: {
        side: 'right',
        baseStartRatio: 0.4,
        baseEndRatio: 0.6,
        tip: { x: 120, y: 40 },
      },
    },
    shapeKind: 'dynamic-callout',
  });
  const props = {
    applyRichShapePatch: params.applyRichShapePatch,
    arrangeSelection: params.arrangeSelection,
    capabilities: ['fill', 'line', 'text', 'effects'],
    recentColors: params.recentColors,
    roughCapable: false,
    shape,
    shapeFillPalette: params.shapeFillPalette,
    shapeStrokePalette: params.shapeStrokePalette,
    textColorPalette: params.textColorPalette,
    toNumber: params.toNumber,
    updateColor: params.updateColor,
  } as const;

  const typedProps = props as React.ComponentProps<typeof RichShapeTailSection>;
  const markup = renderToStaticMarkup(<RichShapeTailSection {...typedProps} />);
  const empty = renderToStaticMarkup(
    <RichShapeTailSection {...{ ...typedProps, shape: createDefaultRichShapeObject() }} />
  );

  expect(markup).toContain('Хвостик');
  expect(markup).toContain('Справа');
  expect(markup).toContain('Сбросить хвостик');
  expect(empty).toBe('');
});

it('omits rich shape commands when no rich shape is selected', () => {
  expect(buildRichShapeCompactCommands(createInspectorCommandParams() as never)).toEqual([]);
});

it('uses solid fill color when rough fill is unavailable', () => {
  const params = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & { richShapeSelection: ReturnType<typeof createDefaultRichShapeObject> };
  const { fillColor: _fillColor, ...roughWithoutFill } = createDefaultRichShapeObject().rough;
  params.richShapeSelection = createDefaultRichShapeObject({
    rough: { ...roughWithoutFill, enabled: false },
    style: {
      ...createDefaultRichShapeObject().style,
      fill: { type: 'solid', color: '#112233' },
    },
  });

  const commands = buildRichShapeCompactCommands(params as never);
  const markup = renderToStaticMarkup(
    <>{commands.find((command) => command.id === 'rich-shape-fill')?.trigger}</>
  );

  expect(markup).toContain('#112233');
});

it('uses the first gradient stop as the fill trigger color', () => {
  const params = createInspectorCommandParams() as ReturnType<
    typeof createInspectorCommandParams
  > & { richShapeSelection: ReturnType<typeof createDefaultRichShapeObject> };
  params.richShapeSelection = createDefaultRichShapeObject({
    rough: { ...createDefaultRichShapeObject().rough, enabled: false },
    style: {
      ...createDefaultRichShapeObject().style,
      fill: {
        type: 'gradient',
        gradientType: 'linear',
        angle: 0,
        stops: [
          { color: '#445566', offset: 0, transparency: 0 },
          { color: '#ffffff', offset: 1, transparency: 0 },
        ],
      },
    },
  });

  const commands = buildRichShapeCompactCommands(params as never);
  const markup = renderToStaticMarkup(
    <>{commands.find((command) => command.id === 'rich-shape-fill')?.trigger}</>
  );

  expect(markup).toContain('#445566');
});
