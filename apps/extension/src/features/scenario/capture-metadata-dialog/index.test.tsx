// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioCaptureMetadataDialog } from './index';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-modal', () => ({
  ProductModal: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { title: string }) => <div>{props.title}</div>,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const autoClickView = {
  captureMetadata: {
    pointerRange: {
      start: { x: 420, y: 220 },
      end: { x: 460, y: 250 },
      minX: 420,
      minY: 220,
      maxX: 460,
      maxY: 250,
      distance: 50,
      durationMs: 180,
    },
    scroll: {
      startX: 0,
      startY: 100,
      endX: 0,
      endY: 260,
      deltaX: 0,
      deltaY: 160,
    },
    trigger: 'pointer-up' as const,
  },
  captureSurface: 'visible' as const,
  cursorPoint: { x: 460, y: 250 },
  interactionPoint: { x: 452, y: 244 },
  page: {
    title: 'Release dashboard',
    url: 'https://example.test/releases',
    viewport: { x: 0, y: 0, width: 1440, height: 900 },
    scrollX: 0,
    scrollY: 260,
    devicePixelRatio: 2,
  },
  sourceKind: 'auto-click' as const,
  target: {
    selector: '[data-testid="publish"]',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Publish',
    ariaLabel: 'Publish',
    title: null,
    rect: { x: 388, y: 194, width: 140, height: 52 },
    framePadding: { top: 4, left: 4, right: 4, bottom: 4 },
  },
};

const fullManualView = {
  captureMetadata: {
    pointerRange: null,
    scroll: null,
    trigger: 'keyboard-enter' as const,
  },
  captureSurface: 'full' as const,
  cursorPoint: null,
  interactionPoint: null,
  page: {
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  },
  sourceKind: 'manual' as const,
  target: null,
};

const selectionView = {
  ...fullManualView,
  captureMetadata: {
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up' as const,
  },
  captureSurface: 'selection' as const,
  page: {
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 800, height: 600 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  },
};

function renderMetadataDialog(props: Parameters<typeof ScenarioCaptureMetadataDialog>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioCaptureMetadataDialog {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

function verifiesAutoClickMetadataRender() {
  renderMetadataDialog({
    onClose: vi.fn(),
    stepTitle: 'Publish release',
    view: autoClickView,
  });

  expect(container?.textContent).toContain('Publish release');
  expect(container?.textContent).toContain('scenario.common.metadata.values.sourceAutoClick');
  expect(container?.textContent).toContain('scenario.common.metadata.values.surfaceVisible');
  expect(container?.textContent).toContain('scenario.common.metadata.values.triggerPointerUp');
}

function verifiesFullManualFallbackRender() {
  renderMetadataDialog({
    onClose: vi.fn(),
    view: fullManualView,
  });

  expect(container?.textContent).toContain('scenario.common.metadata.values.sourceManual');
  expect(container?.textContent).toContain('scenario.common.metadata.values.surfaceFull');
  expect(container?.textContent).toContain('scenario.common.metadata.values.triggerKeyboardEnter');
  expect(container?.textContent).toContain('scenario.common.metadata.empty');
}

function verifiesSelectionSurfaceRender() {
  renderMetadataDialog({
    onClose: vi.fn(),
    view: selectionView,
  });

  expect(container?.textContent).toContain('scenario.common.metadata.values.surfaceSelection');
}

function runScenarioCaptureMetadataDialogSuite() {
  it(
    'renders populated auto-click metadata in a readable grouped format',
    verifiesAutoClickMetadataRender
  );
  it(
    'renders fallback empty values for full-surface manual captures',
    verifiesFullManualFallbackRender
  );
  it(
    'renders the selection-surface branch separately from visible/full',
    verifiesSelectionSurfaceRender
  );
}

describe('ScenarioCaptureMetadataDialog', runScenarioCaptureMetadataDialogSuite);
