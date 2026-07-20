// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PageStyleDeclarationValueMap } from '../runtime/properties';
import { usePageStyleValueActions } from './actions';

const mocks = vi.hoisted(() => ({
  applyPageStylePatchWithHistory: vi.fn(),
}));

vi.mock('../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/actions')>()),
  applyPageStylePatchWithHistory: mocks.applyPageStylePatchWithHistory,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof usePageStyleValueActions> | null = null;
let latestValues: PageStyleDeclarationValueMap = {};

function createSelection(element: HTMLElement) {
  return {
    domPath: 'p#target',
    element,
    kind: 'text' as const,
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: 'p#target',
    tagName: 'p',
    textPreview: 'Target',
  };
}

function Harness(props: { defaultValues: PageStyleDeclarationValueMap; target: HTMLElement }) {
  const [values, setValues] = React.useState<PageStyleDeclarationValueMap>(props.defaultValues);
  latestValues = values;
  latest = usePageStyleValueActions({
    defaultValues: props.defaultValues,
    selection: createSelection(props.target),
    setValues,
  });
  return null;
}

async function renderHarness(defaultValues: PageStyleDeclarationValueMap) {
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(<Harness defaultValues={defaultValues} target={target} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.applyPageStylePatchWithHistory.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  latest = null;
  latestValues = {};
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('tracks manual dirty values and removes them when reset to computed default', async () => {
  await renderHarness({ color: 'rgb(17, 17, 17)' });

  await act(async () => {
    latest?.updateValue('color', 'rgb(22, 22, 22)');
  });
  expect(latestValues.color).toBe('rgb(22, 22, 22)');

  await act(async () => {
    latest?.resetValue('color');
  });

  expect(latestValues.color).toBe('rgb(17, 17, 17)');
  expect(mocks.applyPageStylePatchWithHistory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      patch: { assets: [], declarations: [{ property: 'color', value: null }] },
    })
  );
});

it('applies linked side field updates as one atomic patch', async () => {
  await renderHarness({
    'border-bottom-style': 'solid',
    'border-left-style': 'solid',
    'border-right-style': 'solid',
    'border-top-style': 'solid',
  });

  await act(async () => {
    latest?.updateValues([
      { property: 'border-top-width', value: '4px' },
      { property: 'border-right-width', value: '4px' },
      { property: 'border-bottom-width', value: '4px' },
      { property: 'border-left-width', value: '4px' },
    ]);
  });

  expect(mocks.applyPageStylePatchWithHistory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      patch: {
        assets: [],
        declarations: [
          { property: 'border-top-width', value: '4px' },
          { property: 'border-right-width', value: '4px' },
          { property: 'border-bottom-width', value: '4px' },
          { property: 'border-left-width', value: '4px' },
        ],
      },
    })
  );
});

it('adds visible border styles when border width changes from computed none', async () => {
  await renderHarness({
    'border-top-style': 'none',
    'border-top-width': '0px',
  });

  await act(async () => {
    latest?.updateValue('border-top-width', '2px');
  });

  expect(latestValues['border-top-width']).toBe('2px');
  expect(latestValues['border-top-style']).toBe('solid');
  expect(mocks.applyPageStylePatchWithHistory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      patch: {
        assets: [],
        declarations: [
          { property: 'border-top-width', value: '2px' },
          { property: 'border-top-style', value: 'solid' },
        ],
      },
    })
  );
});
