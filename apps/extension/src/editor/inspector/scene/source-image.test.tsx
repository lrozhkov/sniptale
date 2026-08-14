// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { EditorInspectorFrameSourceImageSection } from './source-image';

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  SelectField: (props: { value: string; onChange: (value: string) => void }) => (
    <button
      type="button"
      data-testid="select"
      data-value={props.value}
      onClick={() => props.onChange('dot')}
    >
      select
    </button>
  ),
  ColorField: (props: { value: string; onChange: (value: string) => void }) => (
    <button
      type="button"
      data-testid="color"
      data-value={props.value}
      onClick={() => props.onChange('#abcdef')}
    >
      color
    </button>
  ),
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  EditorInspectorRangeField: (props: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <button
      type="button"
      data-testid="range"
      aria-label={props.label}
      data-value={String(props.value)}
      onClick={() => props.onChange(50)}
    >
      range
    </button>
  ),
}));

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

it('keeps core source image geometry visible and expands advanced settings on demand', async () => {
  const applyFramePatch = vi.fn();

  await renderUi(
    <EditorInspectorFrameSourceImageSection
      applyFramePatch={applyFramePatch}
      frameDraft={DEFAULT_EDITOR_FRAME_SETTINGS}
      lineStyleOptions={[{ label: 'Dot', value: 'dot' }]}
      recentColors={['#111111']}
      shapeStrokePalette={['#222222']}
    />
  );

  expect(container?.querySelector('details')?.open).toBe(false);
  expect(container?.querySelectorAll('[data-testid="range"]').length).toBeGreaterThanOrEqual(2);

  await act(async () => {
    const details = container?.querySelector('details');
    if (details) details.open = true;
  });
  await act(async () => {
    container
      ?.querySelectorAll('[data-testid="range"]')
      .forEach((element) => (element as HTMLButtonElement).click());
    (container?.querySelector('[data-testid="select"]') as HTMLButtonElement | undefined)?.click();
    container
      ?.querySelectorAll('[data-testid="color"]')
      .forEach((element) => (element as HTMLButtonElement).click());
  });

  expect(container?.querySelector('details')?.open).toBe(true);
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ opacity: 0.5 }) })
  );
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ strokeStyle: 'dot' }) })
  );
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ shadowColor: '#abcdef' }) })
  );
});
