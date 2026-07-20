// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  NumericRow: (props: {
    label: string;
    value: number;
    unit?: string;
    onPreviewValue: (value: number) => void;
    className?: string;
  }) => (
    <button
      type="button"
      data-testid="numeric-row"
      aria-label={props.label}
      data-value={String(props.value)}
      data-unit={props.unit ?? ''}
      data-class={props.className ?? ''}
      onClick={() => props.onPreviewValue(24)}
    >
      numeric row
    </button>
  ),
  NumericValueField: (props: {
    label: string;
    value: number;
    unit?: string;
    onPreviewValue: (value: number) => void;
    className?: string;
  }) => (
    <button
      type="button"
      data-testid="numeric-value-field"
      aria-label={props.label}
      data-value={String(props.value)}
      data-unit={props.unit ?? ''}
      data-class={props.className ?? ''}
      onClick={() => props.onPreviewValue(24)}
    >
      numeric field
    </button>
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
      container?.querySelector('[data-testid="numeric-row"]') as HTMLButtonElement | undefined
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

it('starts with linked scene padding and reveals side fields after unlinking', async () => {
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

  expect(container?.querySelectorAll('[data-testid="numeric-row"]')).toHaveLength(1);
  expect(container?.querySelectorAll('[data-testid="numeric-value-field"]')).toHaveLength(0);
  expect(container?.querySelector('[aria-pressed="true"]')).not.toBeNull();

  await act(async () => {
    (container?.querySelector('[aria-pressed]') as HTMLButtonElement | undefined)?.click();
  });

  expect(container?.querySelectorAll('[data-testid="numeric-row"]')).toHaveLength(1);
  expect(container?.querySelectorAll('[data-testid="numeric-value-field"]')).toHaveLength(4);
  expect(container?.querySelector('[aria-pressed="false"]')).not.toBeNull();
});
