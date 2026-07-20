// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
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
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

import { RichShapeFillModeSelector } from './fill-mode-selector';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

function renderSelector(applyRichShapePatch = vi.fn(), setMode = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <RichShapeFillModeSelector
        mode="solid"
        options={[
          { value: 'none', label: 'None' },
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'sketch', label: 'Rough' },
        ]}
        props={
          {
            applyRichShapePatch,
            shape: createDefaultRichShapeObject(),
          } as never
        }
        setMode={setMode}
        solidColor="#123456"
        stops={[
          { color: '#111111', offset: 0, transparency: 0 },
          { color: '#222222', offset: 1, transparency: 0 },
        ]}
      />
    );
  });
  return { applyRichShapePatch, setMode };
}

function click(label: string) {
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === label)
      ?.click();
  });
}

it('applies every rich shape fill mode through the selector', () => {
  const { applyRichShapePatch, setMode } = renderSelector();

  click('None');
  click('Solid');
  click('Gradient');
  click('Rough');

  expect(setMode).toHaveBeenCalledWith('none');
  expect(setMode).toHaveBeenCalledWith('solid');
  expect(setMode).toHaveBeenCalledWith('gradient');
  expect(setMode).toHaveBeenCalledWith('sketch');
  expect(applyRichShapePatch).toHaveBeenCalledWith({
    rough: { enabled: false },
    style: { fillTransparency: 1 },
  });
  expect(applyRichShapePatch).toHaveBeenCalledWith({
    rough: { enabled: false },
    style: { fill: { type: 'solid', color: '#123456' }, fillTransparency: 0 },
  });
  expect(applyRichShapePatch).toHaveBeenCalledWith(
    expect.objectContaining({
      rough: { enabled: false },
      style: expect.objectContaining({ fillTransparency: 0 }),
    })
  );
  expect(applyRichShapePatch).toHaveBeenCalledWith(
    expect.objectContaining({
      rough: expect.objectContaining({ enabled: true }),
      style: { fillTransparency: 0 },
    })
  );
});
