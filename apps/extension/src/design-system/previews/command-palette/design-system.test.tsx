// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paletteSpy: vi.fn(),
}));

vi.mock('../../../ui/command-palette/index', () => ({
  CommandPalette: (props: {
    dataUi?: string;
    actions: Array<{ id: string; shortcut?: string; onSelect: () => void }>;
    onClose: () => void;
  }) => {
    mocks.paletteSpy(props);

    return (
      <div
        data-testid={props.dataUi}
        data-action-count={String(props.actions.length)}
        onClick={props.onClose}
      />
    );
  },
}));

import { buildCommandPaletteSharedPreviews } from './design-system';

type MockPaletteProps = {
  dataUi?: string;
  actions: Array<{ id: string; shortcut?: string; onSelect: () => void }>;
  onClose: () => void;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function expectPreviewIds(previews: ReturnType<typeof buildCommandPaletteSharedPreviews>) {
  expect(previews.map((preview) => preview.previewId)).toEqual([
    'shared.ui.command-palette.default',
    'shared.ui.command-palette.empty',
  ]);
}

function renderPreviews(previews: ReturnType<typeof buildCommandPaletteSharedPreviews>) {
  renderNode(
    <>
      {previews[0]?.preview}
      {previews[1]?.preview}
    </>
  );
}

function getPaletteProps() {
  const defaultProps = mocks.paletteSpy.mock.calls[0]?.[0] as MockPaletteProps;
  const emptyProps = mocks.paletteSpy.mock.calls[1]?.[0] as MockPaletteProps;

  return { defaultProps, emptyProps };
}

function triggerPreviewCallbacks(defaultProps: MockPaletteProps, emptyProps: MockPaletteProps) {
  act(() => {
    defaultProps.onClose();
    emptyProps.onClose();
    defaultProps.actions.forEach((action) => action.onSelect());
  });
}

function expectDefaultPreviewProps(defaultProps: MockPaletteProps) {
  expect(defaultProps.dataUi).toBe('shared.ui.command-palette.preview');
  expect(defaultProps.actions.map((action) => action.id)).toEqual([
    'prepare-page',
    'open-editor',
    'open-settings',
  ]);
  expect(defaultProps.actions.map((action) => action.shortcut)).toEqual([
    'Alt+S',
    'Alt+E',
    'Ctrl+,',
  ]);
}

function expectRenderedPreviewCounts() {
  expect(
    container
      ?.querySelector('[data-testid="shared.ui.command-palette.preview"]')
      ?.getAttribute('data-action-count')
  ).toBe('3');
  expect(
    container
      ?.querySelector('[data-testid="shared.ui.command-palette.preview.empty"]')
      ?.getAttribute('data-action-count')
  ).toBe('0');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.paletteSpy.mockReset();
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

describe('buildCommandPaletteSharedPreviews', () => {
  it('builds localized preview variants from the shared command palette surface', () => {
    const previews = buildCommandPaletteSharedPreviews('en');

    expectPreviewIds(previews);
    renderPreviews(previews);

    const { defaultProps, emptyProps } = getPaletteProps();

    expectDefaultPreviewProps(defaultProps);
    triggerPreviewCallbacks(defaultProps, emptyProps);

    expect(emptyProps.dataUi).toBe('shared.ui.command-palette.preview.empty');
    expect(emptyProps.actions).toEqual([]);
    expectRenderedPreviewCounts();
  });
});
