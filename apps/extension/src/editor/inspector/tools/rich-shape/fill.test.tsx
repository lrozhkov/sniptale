// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
} from '../../../../features/editor/document/rich-shape';
import type { EditorRichShapeFormattingPatch } from '../../../controller/rich-shape-formatting';

function MockCompactSelect(props: {
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <button type="button" onClick={() => props.onChange(props.options[1]?.value ?? '')}>
      select-fill-style
    </button>
  );
}

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  ColorField: (props: {
    title: string;
    value: string;
    onChange: (color: string) => void;
    onPreviewChange?: (color: string) => void;
  }) => (
    <button
      type="button"
      data-value={props.value}
      onMouseEnter={() => props.onPreviewChange?.('#654321')}
      onClick={() => props.onChange('#123456')}
    >
      {props.title}
    </button>
  ),
  NumericRow: (props: {
    label: string;
    onCommitValue: (value: number) => void;
    onPreviewValue?: (value: number) => void;
  }) => (
    <button
      type="button"
      data-testid={`range-${props.label}`}
      onClick={() => {
        props.onPreviewValue?.(50);
        props.onCommitValue(50);
      }}
    />
  ),
  CompactSelect: MockCompactSelect,
  SelectField: (props: {
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <div data-select-field="true">
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
  useAppLocale: vi.fn(),
}));

import { RichShapeFillSection } from './fill';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderFillSection(args: {
  applyRichShapePatch: (patch: EditorRichShapeFormattingPatch) => void;
  roughCapable?: boolean;
  shape?: ReturnType<typeof createDefaultRichShapeObject>;
  updateColor?: (setter: (value: string) => void, color: string) => void;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <RichShapeFillSection
        applyRichShapePatch={args.applyRichShapePatch}
        arrangeSelection={vi.fn()}
        capabilities={['fill']}
        recentColors={['#000000']}
        roughCapable={args.roughCapable ?? true}
        shape={args.shape ?? createDefaultRichShapeObject()}
        shapeFillPalette={['#123456']}
        shapeStrokePalette={[]}
        textColorPalette={[]}
        toNumber={(value) => Number(value)}
        updateColor={args.updateColor ?? vi.fn()}
      />
    );
  });
}

function createTransparentGradientShape() {
  const shape = createDefaultRichShapeObject();
  shape.style = {
    ...shape.style,
    fill: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 90,
      stops: [
        { color: '#111111', offset: 0, transparency: 0 },
        { color: '#222222', offset: 1, transparency: 0 },
      ],
    },
    fillTransparency: 1,
  };
  return shape;
}

function createRoughGradientShape() {
  const rough = createEnabledRichShapeRoughStyle('rough-fill');
  delete (rough as { fillColor?: string }).fillColor;
  const shape = createDefaultRichShapeObject({ rough });
  shape.style = { ...createTransparentGradientShape().style, fillTransparency: 0 };
  return shape;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('rich shape fill controls', () => {
  it('threads solid fill color updates through the editor color control', () => {
    const applyRichShapePatch = vi.fn();
    const updateColor = vi.fn((setter: (value: string) => void, color: string) => setter(color));

    renderFillSection({ applyRichShapePatch, updateColor });

    act(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'editor.compact.fillColor')
        ?.click();
    });

    expect(updateColor).toHaveBeenCalledWith(expect.any(Function), '#123456');
    expect(applyRichShapePatch).toHaveBeenCalledWith({
      style: { fill: { type: 'solid', color: '#123456' } },
    });
    expect(document.querySelector('[data-select-field]')).not.toBeNull();
  });

  it('threads pencil fill color updates into rough fill settings', () => {
    const applyRichShapePatch = vi.fn();
    const updateColor = vi.fn((setter: (value: string) => void, color: string) => setter(color));

    renderFillSection({
      applyRichShapePatch,
      shape: createDefaultRichShapeObject({
        rough: createEnabledRichShapeRoughStyle('rough-fill', { fillColor: '#abcdef' }),
      }),
      updateColor,
    });

    act(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'editor.compact.fillColor')
        ?.click();
    });

    expect(updateColor).toHaveBeenCalledWith(expect.any(Function), '#123456');
    expect(applyRichShapePatch).toHaveBeenCalledWith({
      rough: { enabled: true, fillColor: '#123456' },
    });
  });
});

describe('rich shape fill mode restoration', () => {
  it('switches transparent fills back to the stored fill mode', () => {
    const applyRichShapePatch = vi.fn();
    renderFillSection({
      applyRichShapePatch,
      shape: createTransparentGradientShape(),
    });

    act(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="range-editor.compact.richShapeTransparency"]'
        )
        ?.click();
    });

    expect(applyRichShapePatch).toHaveBeenCalledWith({ style: { fillTransparency: 0.5 } });
    expect(document.body.textContent).toContain('editor.compact.richShapeFillGradient');
  });
});

describe('rich shape rough fill fallbacks', () => {
  it('uses independent rough fill fallback color and texture controls', () => {
    const applyRichShapePatch = vi.fn();
    const updateColor = vi.fn((setter: (value: string) => void, color: string) => setter(color));
    renderFillSection({
      applyRichShapePatch,
      shape: createRoughGradientShape(),
      updateColor,
    });

    const fillButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'editor.compact.fillColor'
    );

    expect(fillButton?.dataset['value']).toBe('#ffffff');
    act(() => {
      fillButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      fillButton?.click();
      document.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
      document
        .querySelector<HTMLButtonElement>('[data-testid="range-editor.compact.richShapeBowing"]')
        ?.click();
    });

    expect(updateColor).toHaveBeenCalledWith(expect.any(Function), '#654321');
    expect(applyRichShapePatch).toHaveBeenCalledWith({
      rough: { enabled: true, fillColor: '#123456' },
    });
    expect(applyRichShapePatch).toHaveBeenCalledWith({
      rough: { enabled: true, fillBowing: 50 },
    });
  });
});
