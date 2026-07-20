// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  SelectField: (props: {
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <div>
      {props.options.map((option) => (
        <button key={option.value} type="button" onClick={() => props.onChange(option.value)}>
          {option.value}
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

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('rich shape fill mode branches', () => {
  it('routes none, solid, and gradient fill mode patches', () => {
    const applyRichShapePatch = vi.fn();
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
          roughCapable={false}
          shape={createDefaultRichShapeObject()}
          shapeFillPalette={[]}
          shapeStrokePalette={[]}
          textColorPalette={[]}
          toNumber={(value) => Number(value)}
          updateColor={vi.fn()}
        />
      );
    });
    act(() => {
      ['none', 'solid', 'gradient'].forEach((mode) =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent === mode)
          ?.click()
      );
    });

    expect(applyRichShapePatch).toHaveBeenCalledWith({
      rough: { enabled: false },
      style: { fillTransparency: 1 },
    });
    expect(applyRichShapePatch).toHaveBeenCalledWith(
      expect.objectContaining({ rough: { enabled: false } })
    );
    expect(applyRichShapePatch).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fill: expect.objectContaining({ type: 'gradient' }) }),
      })
    );
  });
});
