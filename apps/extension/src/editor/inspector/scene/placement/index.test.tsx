// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) =>
      ({
        'editor.scene.placementSection': 'Placement',
      })[key] ?? key,
  };
});

import { EditorInspectorFramePlacementSection } from './';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  SelectField: (props: {
    label: string;
    options: Array<{ label: string; value: EditorFrameSettings['layoutMode'] }>;
    value: EditorFrameSettings['layoutMode'];
    onChange: (value: EditorFrameSettings['layoutMode']) => void;
  }) => (
    <section data-testid="select-field">
      <span>{props.label}</span>
      <button
        type="button"
        data-testid="select-field-trigger"
        aria-label={props.label}
        onClick={() =>
          props.onChange(
            props.options.find((option) => option.value !== props.value)?.value ??
              props.options[0]!.value
          )
        }
      >
        {props.options.find((option) => option.value === props.value)?.label ?? props.value}
      </button>
    </section>
  ),
}));

vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  PanelSection: (props: { label: string; value?: string; children: React.ReactNode }) => (
    <section data-testid="panel-section">
      <span>{props.label}</span>
      {props.value ? <span>{props.value}</span> : null}
      {props.children}
    </section>
  ),
}));

vi.mock('./modes', () => ({
  EditorInspectorFrameModeButtons: (props: {
    ariaLabel?: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <button
      type="button"
      data-testid="mode-buttons"
      data-aria-label={props.ariaLabel}
      onClick={() => props.onChange(props.value)}
    >
      {props.options.length}
    </button>
  ),
}));

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'color',
  backgroundColor: '#ffffff',
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};

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

it('renders placement controls without a duplicated header value and forwards layout updates', async () => {
  const setLayoutMode = vi.fn();

  await renderUi(
    <EditorInspectorFramePlacementSection
      frameDraft={FRAME}
      frameLayoutModeOptions={[
        { value: 'fit-image', label: 'Fit image' },
        { value: 'expand-canvas', label: 'Expand canvas' },
      ]}
      setLayoutMode={setLayoutMode}
    />
  );

  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).toContain(
    'Placement'
  );
  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).toContain(
    'Fit image'
  );
  expect(container?.querySelector('[data-testid="mode-buttons"]')).toBeNull();
  expect(
    container?.querySelector('[data-testid="select-field-trigger"]')?.getAttribute('aria-label')
  ).toBe('Placement');
  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).not.toContain(
    'current canvas'
  );

  await act(async () => {
    (
      container?.querySelector('[data-testid="select-field-trigger"]') as
        | HTMLButtonElement
        | undefined
    )?.click();
  });

  expect(setLayoutMode).toHaveBeenCalledWith('expand-canvas');
});

it('keeps placement controls compact for expand-canvas', async () => {
  await renderUi(
    <EditorInspectorFramePlacementSection
      frameDraft={{ ...FRAME, layoutMode: 'expand-canvas' }}
      frameLayoutModeOptions={[
        { value: 'fit-image', label: 'Fit image' },
        { value: 'expand-canvas', label: 'Expand canvas' },
      ]}
      setLayoutMode={vi.fn()}
    />
  );

  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).toContain(
    'Expand canvas'
  );
  expect(container?.querySelector('[data-testid="mode-buttons"]')).toBeNull();
  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).not.toContain(
    'document expands'
  );
});

it('falls back to the draft layout mode when options are incomplete', async () => {
  const setLayoutMode = vi.fn();

  await renderUi(
    <EditorInspectorFramePlacementSection
      frameDraft={{ ...FRAME, layoutMode: 'expand-canvas' }}
      frameLayoutModeOptions={[{ value: 'fit-image', label: 'Fit image' }]}
      setLayoutMode={setLayoutMode}
    />
  );

  expect(container?.querySelector('[data-testid="select-field"]')?.textContent).toContain(
    'expand-canvas'
  );

  await act(async () => {
    (
      container?.querySelector('[data-testid="select-field-trigger"]') as
        | HTMLButtonElement
        | undefined
    )?.click();
  });

  expect(setLayoutMode).toHaveBeenCalledWith('fit-image');
});
