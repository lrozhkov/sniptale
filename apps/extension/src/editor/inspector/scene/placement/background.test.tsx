// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) =>
    ({
      'editor.scene.backgroundTypeSection': 'Background type',
    })[key] ?? key,
}));

import { EditorInspectorFrameBackgroundSection } from './background';

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
    onChange: (value: string) => void;
  }) => {
    const firstOption = props.options[0];
    if (!firstOption) {
      return null;
    }

    return (
      <button
        type="button"
        data-testid="mode-buttons"
        data-aria-label={props.ariaLabel}
        onClick={() => props.onChange(firstOption.value)}
      >
        switch
      </button>
    );
  },
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

it('renders the background section without a duplicated header value and forwards mode updates', async () => {
  const setBackgroundMode = vi.fn();

  await renderUi(
    <EditorInspectorFrameBackgroundSection
      frameBackgroundModeOptions={[
        { value: 'color', label: 'Solid' },
        { value: 'gradient', label: 'Gradient' },
      ]}
      frameDraft={FRAME}
      setBackgroundMode={setBackgroundMode}
    />
  );

  expect(container?.querySelector('[data-testid="panel-section"]')?.textContent).toContain(
    'Background type'
  );
  expect(container?.querySelector('[data-testid="panel-section"]')?.textContent).not.toContain(
    'Solid'
  );
  expect(
    container?.querySelector('[data-testid="mode-buttons"]')?.getAttribute('data-aria-label')
  ).toBe('Background type');

  await act(async () => {
    (
      container?.querySelector('[data-testid="mode-buttons"]') as HTMLButtonElement | undefined
    )?.click();
  });

  expect(setBackgroundMode).toHaveBeenCalledWith('color');
});
