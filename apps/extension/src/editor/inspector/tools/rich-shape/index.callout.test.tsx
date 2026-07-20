import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderRichShapeControlsSection } from './';

it('renders dynamic callout tail controls from the full rich-shape controls section', () => {
  const params = createInspectorCommandParams();
  const shape = createDefaultRichShapeObject({
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

  const markup = renderToStaticMarkup(
    <>
      {renderRichShapeControlsSection({
        applyRichShapePatch: vi.fn(),
        arrangeSelection: params.arrangeSelection,
        recentColors: params.recentColors,
        shape,
        shapeFillPalette: params.shapeFillPalette,
        shapeStrokePalette: params.shapeStrokePalette,
        textColorPalette: params.textColorPalette,
        toNumber: params.toNumber,
        updateColor: params.updateColor,
      })}
    </>
  );

  expect(markup).toContain('Хвостик');
  expect(markup).toContain('Сверху');
});
