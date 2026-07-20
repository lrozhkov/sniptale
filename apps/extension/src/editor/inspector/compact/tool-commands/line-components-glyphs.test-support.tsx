import { renderToStaticMarkup } from 'react-dom/server';
import { expect } from 'vitest';
import type {
  EditorLineCornerStyle,
  EditorLineFillMode,
  EditorLineStyle,
} from '../../../../features/editor/document/line-types';
import { ShapeStrokeStyleSelector, ShapeStrokeStyleTrigger } from './shape-options';
import {
  LineCornerSelector,
  LineCornerTrigger,
  LineFillModeSelector,
  LineStyleSelector,
  LineStyleTrigger,
} from './line-options';
import {
  CORNER_OPTIONS,
  FILL_OPTIONS,
  LINE_STYLE_OPTIONS,
  SHAPE_STYLE_OPTIONS,
} from './line-components-options.test-support';

export function expectLineStyleGlyphs(onChange: (value: EditorLineStyle) => void) {
  const lineStyleMarkup = renderToStaticMarkup(
    <LineStyleSelector
      ariaLabel="Line style"
      onChange={onChange}
      options={LINE_STYLE_OPTIONS}
      value="solid"
    />
  );
  expect(lineStyleMarkup).toContain('shared.ui.compact-inspector.select-field');
  expect(lineStyleMarkup).toContain('Solid');
  expect(renderToStaticMarkup(<LineStyleTrigger value="long-dash" />)).toContain(
    'repeating-linear-gradient'
  );
  expect(renderToStaticMarkup(<LineStyleTrigger value="dash-dot" />)).toContain(
    'currentColor 13px 15px'
  );
  expect(renderToStaticMarkup(<LineStyleTrigger value="dash" />)).toContain('span');
  expect(renderToStaticMarkup(<LineStyleTrigger value="dot" />)).toContain('span');
}

export function expectLineCornerGlyphs(onChange: (value: EditorLineCornerStyle) => void) {
  expect(
    renderToStaticMarkup(
      <LineCornerSelector
        ariaLabel="Corners"
        onChange={onChange}
        options={CORNER_OPTIONS}
        value="round"
      />
    )
  ).toContain('role="group"');
  expect(renderToStaticMarkup(<LineCornerTrigger value="sharp" />)).toContain('span');
}

export function expectLineFillGlyphs(onChange: (value: EditorLineFillMode) => void) {
  expect(
    renderToStaticMarkup(
      <LineFillModeSelector
        ariaLabel="Fill"
        onChange={onChange}
        options={FILL_OPTIONS}
        value="gradient"
      />
    )
  ).toContain('shared.ui.compact-inspector.select-field');
}

export function expectShapeStrokeGlyphs(onChange: (value: 'solid' | 'dashed' | 'dotted') => void) {
  expect(
    renderToStaticMarkup(
      <ShapeStrokeStyleSelector
        ariaLabel="Shape style"
        onChange={onChange}
        options={SHAPE_STYLE_OPTIONS}
        value="dotted"
      />
    )
  ).toContain('role="group"');
  expect(renderToStaticMarkup(<ShapeStrokeStyleTrigger value="solid" />)).toContain('bg-current');
  expect(renderToStaticMarkup(<ShapeStrokeStyleTrigger value="dashed" />)).toContain('span');
}
