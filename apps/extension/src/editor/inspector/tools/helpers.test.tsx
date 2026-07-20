// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const helperMocks = vi.hoisted(() => ({
  updateLockedDraft: vi.fn(() => ({ height: 80, width: 160 })),
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../sidebar-shared', () => ({
  DimensionInput: (props: { label: string; onChange: (value: number) => void }) => (
    <button type="button" data-label={props.label} onClick={() => props.onChange(80)}>
      {props.label}
    </button>
  ),
  updateLockedDraft: helperMocks.updateLockedDraft,
}));

import {
  panelButtonClassName,
  primaryPanelButtonClassName,
  renderDefaultToolInspector,
  renderLayerSizeInputs,
  secondaryPanelButtonClassName,
  selectSharedToolProps,
} from './helpers';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function invokeLayerSizeDraftUpdaters(setLayerSizeDraft: ReturnType<typeof vi.fn>) {
  const widthUpdater = setLayerSizeDraft.mock.calls[0]?.[0] as
    | ((state: { width: number; height: number }) => { width: number; height: number })
    | undefined;
  const heightUpdater = setLayerSizeDraft.mock.calls[1]?.[0] as
    | ((state: { width: number; height: number }) => { width: number; height: number })
    | undefined;

  widthUpdater?.({ width: 120, height: 60 });
  heightUpdater?.({ width: 160, height: 80 });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  helperMocks.updateLockedDraft.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('exports shared chrome classes and preserves shared tool props', () => {
  expect(panelButtonClassName).toContain('rounded-[12px]');
  expect(primaryPanelButtonClassName).toContain('text-[12px] font-medium');
  expect(secondaryPanelButtonClassName).toContain('border-none');
  expect(
    selectSharedToolProps({
      inspectorToolSettings: { strokeColor: '#fff' } as never,
      previewColor: vi.fn(),
      recentColors: ['#fff'],
      toNumber: vi.fn(),
      updateColor: vi.fn(),
    })
  ).toEqual(
    expect.objectContaining({
      inspectorToolSettings: { strokeColor: '#fff' },
      recentColors: ['#fff'],
    })
  );
});

it('renders layer size inputs and routes locked updates through the shared helper', () => {
  const setLayerSizeDraft = vi.fn();

  render(
    <>
      {renderLayerSizeInputs({
        layerAspectRatio: 2,
        layerSizeDraft: { width: 120, height: 60 },
        layerSizeLocked: true,
        setLayerSizeDraft,
      })}
      {renderDefaultToolInspector()}
    </>
  );

  const [widthButton, heightButton] = Array.from(container?.querySelectorAll('button') ?? []);
  widthButton?.click();
  heightButton?.click();

  invokeLayerSizeDraftUpdaters(setLayerSizeDraft);

  expect(helperMocks.updateLockedDraft).toHaveBeenCalledTimes(2);
  expect(container?.textContent).toContain('editor.compact.chooseToolOrObject');
  expect(setLayerSizeDraft).toHaveBeenCalledTimes(2);
});
