// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import { EditorInspectorFrameSourceImageFields } from './source-image';

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
    max: number;
    onChange: (value: number) => void;
  }) => (
    <button
      type="button"
      data-testid="range"
      aria-label={props.label}
      data-value={String(props.value)}
      data-max={String(props.max)}
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

it('keeps core source image geometry visible and expands shadow and border settings on demand', async () => {
  const applyFramePatch = vi.fn();

  await renderUi(
    <EditorInspectorFrameSourceImageFields
      applyFramePatch={applyFramePatch}
      frameDraft={DEFAULT_EDITOR_FRAME_SETTINGS}
      lineStyleOptions={[{ label: 'Dot', value: 'dot' }]}
      recentColors={['#111111']}
      shapeStrokePalette={['#222222']}
    />
  );

  expect(
    Array.from(container?.querySelectorAll('details') ?? []).every((group) => !group.open)
  ).toBe(true);
  expect(container?.querySelectorAll('[data-testid="range"]').length).toBeGreaterThanOrEqual(2);

  await act(async () => {
    container?.querySelectorAll('details').forEach((details) => {
      details.open = true;
    });
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

  expect(
    Array.from(container?.querySelectorAll('details') ?? []).every((group) => group.open)
  ).toBe(true);
  expect(
    container?.querySelector(
      '[data-ui="editor.frame.source-basics"] [aria-label="' +
        translate('editor.compact.opacity') +
        '"]'
    )
  ).toBeNull();
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ strokeStyle: 'dot' }) })
  );
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ shadowColor: '#abcdef' }) })
  );
});

it('uses the native 0–100 shadow intensity without scaling it as fractional opacity', async () => {
  const applyFramePatch = vi.fn();
  await renderUi(
    <EditorInspectorFrameSourceImageFields
      applyFramePatch={applyFramePatch}
      frameDraft={{
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, shadow: 35 },
      }}
      recentColors={[]}
    />
  );
  const shadow = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[data-testid="range"]') ?? []
  ).find((element) => element.getAttribute('aria-label') === translate('editor.scene.glowSize'));
  expect(shadow?.dataset['value']).toBe('35');
  expect(shadow?.dataset['max']).toBe('100');
  await act(async () => shadow?.click());
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImage: expect.objectContaining({ shadow: 50 }) })
  );
});

it('gives shadow and border separate collapsible groups', async () => {
  await renderUi(
    <EditorInspectorFrameSourceImageFields
      applyFramePatch={vi.fn()}
      frameDraft={DEFAULT_EDITOR_FRAME_SETTINGS}
      recentColors={[]}
    />
  );

  const groups = Array.from(container?.querySelectorAll('details') ?? []);
  expect(groups).toHaveLength(2);
  expect(groups.map((group) => group.querySelector('summary')?.textContent)).toEqual([
    translate('editor.scene.glowAdvanced'),
    translate('editor.scene.borderAdvanced'),
  ]);
  expect(container?.textContent).toContain(translate('editor.scene.glowLabel'));
  expect(
    container?.querySelector('[aria-label="' + translate('editor.compact.shadowAngle') + '"]')
  ).toBeNull();
  expect(
    container?.querySelector('[aria-label="' + translate('editor.compact.shadowDistance') + '"]')
  ).toBeNull();
  expect(groups.every((group) => !group.open)).toBe(true);
  await act(async () => {
    groups[0]?.setAttribute('open', '');
  });
  expect(groups[0]?.open).toBe(true);
  expect(groups[1]?.open).toBe(false);
});
