// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import type { EditorRichShapeFormattingPatch } from '../../../controller/rich-shape-formatting';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  ColorField: (props: { label: string; onChange: (color: string) => void }) => (
    <button type="button" onClick={() => props.onChange('#123456')}>
      {props.label}
    </button>
  ),
  NumericRow: (props: {
    label: string;
    onCommitValue: (value: number) => void;
    onPreviewValue: (value: number) => void;
  }) => (
    <button
      type="button"
      data-testid={`numeric-${props.label}`}
      onClick={() => {
        props.onPreviewValue(45);
        props.onCommitValue(45);
      }}
    >
      {props.label}
    </button>
  ),
  SegmentedSelector: (props: {
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <div>
      {props.options.map((option) => (
        <button key={option.value} type="button" onClick={() => props.onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
  SelectField: (props: {
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <div>
      {props.options.map((option) => (
        <button key={option.value} type="button" onClick={() => props.onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { RichShapeFillSection } from './fill';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderFillSection(
  shape: ReturnType<typeof createDefaultRichShapeObject>,
  applyRichShapePatch: (patch: EditorRichShapeFormattingPatch) => void,
  roughCapable: boolean
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <RichShapeFillSection
        applyRichShapePatch={applyRichShapePatch}
        arrangeSelection={vi.fn()}
        capabilities={['fill']}
        recentColors={[]}
        roughCapable={roughCapable}
        shape={shape}
        shapeFillPalette={[]}
        shapeStrokePalette={[]}
        textColorPalette={[]}
        toNumber={(value) => Number(value)}
        updateColor={vi.fn((setter: (value: string) => void, color: string) => setter(color))}
      />
    );
  });
}

function createGradientShape() {
  const shape = createDefaultRichShapeObject();
  shape.style = {
    ...shape.style,
    fill: {
      angle: 90,
      gradientType: 'linear',
      stops: [
        { color: '#111111', offset: 0, transparency: 0 },
        { color: '#222222', offset: 0.5, transparency: 0 },
        { color: '#333333', offset: 1, transparency: 0 },
      ],
      type: 'gradient',
    },
  };
  return shape;
}

function clickGradientEditorControls() {
  act(() => {
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'editor.gradient.color')
      ?.click();
    document
      .querySelector<HTMLButtonElement>('[data-testid="numeric-editor.gradient.opacity"]')
      ?.click();
    document
      .querySelector<HTMLButtonElement>('[data-testid="numeric-editor.gradient.angle"]')
      ?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="editor.gradient.addStop"]')?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('rich shape gradient fill controls', () => {
  it('updates gradient stops, stop transparency, angle, and stop count', () => {
    const applyRichShapePatch = vi.fn();
    renderFillSection(createGradientShape(), applyRichShapePatch, true);

    clickGradientEditorControls();

    expect(applyRichShapePatch).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fill: expect.objectContaining({ type: 'gradient' }) }),
      })
    );
    expect(applyRichShapePatch.mock.calls.length).toBeGreaterThan(3);
  });
});

describe('rich shape gradient fill defaults', () => {
  it('creates gradient controls from a solid fill with default positional stops', () => {
    const applyRichShapePatch = vi.fn();
    const shape = createDefaultRichShapeObject();
    renderFillSection(shape, applyRichShapePatch, false);
    act(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'editor.compact.richShapeFillGradient')
        ?.click();
    });
    act(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="numeric-editor.gradient.angle"]')
        ?.click();
    });

    expect(applyRichShapePatch).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          fill: expect.objectContaining({
            angle: 45,
            gradientType: 'linear',
            stops: [
              { color: '#ffffff', offset: 0, transparency: 0 },
              { color: '#dbeafe', offset: 1, transparency: 0 },
            ],
            type: 'gradient',
          }),
        }),
      })
    );
  });
});
