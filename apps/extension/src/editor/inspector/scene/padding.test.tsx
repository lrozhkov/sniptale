// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@sniptale/ui/product-glass-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-glass-controls')>()),
  ProductGlassLinkedPaddingFields: (props: {
    padding: { top: number; right: number; bottom: number; left: number };
    onChange: (padding: { top: number; right: number; bottom: number; left: number }) => void;
    renderValueField: (props: {
      compact: boolean;
      label: string;
      onChange: (value: number) => void;
      side: 'top';
      value: number;
    }) => React.ReactNode;
  }) => (
    <>
      {props.renderValueField({
        compact: true,
        label: 'Top',
        onChange: vi.fn(),
        side: 'top',
        value: props.padding.top,
      })}
      {props.renderValueField({
        compact: false,
        label: 'Top',
        onChange: vi.fn(),
        side: 'top',
        value: props.padding.top,
      })}
      <button
        type="button"
        data-testid="linked-padding"
        onClick={() => props.onChange({ top: 24, right: 24, bottom: 24, left: 24 })}
      >
        {Object.values(props.padding).join('/')}
      </button>
    </>
  ),
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  PanelSection: (props: { label: string; value?: string; children: React.ReactNode }) => (
    <section data-testid="panel-section">
      <span>{props.label}</span>
      {props.value ? <span>{props.value}</span> : null}
      {props.children}
    </section>
  ),
}));

import { FramePaddingSection } from './padding';

const FRAME = {
  backgroundColor: '#fff',
  backgroundGradientAngle: 45,
  backgroundGradientFrom: '#111111',
  backgroundGradientTo: '#222222',
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  backgroundMode: 'gradient',
  browserMode: false,
  browserTitle: '',
  browserUrl: '',
  layoutMode: 'expand-canvas',
  paddingBottom: 12,
  paddingLeft: 12,
  paddingRight: 12,
  paddingTop: 12,
} as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders padding controls without repeating the summary and forwards numeric input updates', async () => {
  const setFrameDraft = vi.fn((value) =>
    typeof value === 'function' ? value(FRAME as never) : value
  );

  await renderUi(
    <FramePaddingSection
      frameDraft={FRAME as never}
      framePaddingSummary="12 / 12 / 12 / 12"
      setFrameDraft={setFrameDraft}
    />
  );

  expect(container?.querySelector('[data-testid="panel-section"]')?.textContent).not.toContain(
    '12 / 12 / 12 / 12'
  );

  await act(async () => {
    (
      container?.querySelector('[data-testid="linked-padding"]') as HTMLButtonElement | undefined
    )?.click();
  });

  expect(setFrameDraft).toHaveBeenCalledTimes(1);
  expect(
    (setFrameDraft.mock.calls[0]?.[0] as (frame: typeof FRAME) => typeof FRAME)(FRAME)
  ).toEqual({
    ...FRAME,
    paddingBottom: 24,
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 24,
  });
});

it('maps frame padding to the shared linked-padding control', async () => {
  const setFrameDraft = vi.fn((value) =>
    typeof value === 'function' ? value(FRAME as never) : value
  );

  await renderUi(
    <FramePaddingSection
      frameDraft={FRAME as never}
      framePaddingSummary="12 / 12 / 12 / 12"
      setFrameDraft={setFrameDraft}
    />
  );

  expect(container?.querySelector('[data-testid="linked-padding"]')?.textContent).toBe(
    '12/12/12/12'
  );
});
