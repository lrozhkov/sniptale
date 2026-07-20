// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioWorkspaceCaptureCanvas } from './view';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./preview', () => ({
  ScenarioWorkspacePreview: () => <div data-testid="scenario-workspace-preview" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createBaseStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
}

function renderCanvas(step = createBaseStep()) {
  const onOpenQuickEdit = vi.fn();
  const onUpdateStep = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioWorkspaceCaptureCanvas
        onOpenQuickEdit={onOpenQuickEdit}
        onUpdateStep={onUpdateStep}
        step={step}
      />
    );
  });

  return { onUpdateStep };
}

function expectPreviewButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('shows preview toggle buttons only when capture metadata supports them and reflects active state', () => {
  renderCanvas(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      target: {
        selector: '#submit',
        iframeSelector: null,
        tagName: 'button',
        role: 'button',
        text: 'Submit',
        ariaLabel: null,
        title: null,
        rect: { x: 10, y: 20, width: 100, height: 40 },
        framePadding: { top: 3, left: 3, right: 3, bottom: 3 },
      },
      cursorPoint: { x: 25, y: 35 },
      overlays: [
        {
          id: 'auto-frame',
          kind: 'focus-rect',
          rect: { x: 7, y: 17, width: 106, height: 46 },
          autoSource: 'capture-target',
        },
      ],
    })
  );

  expect(expectPreviewButton('scenario.editor.autoFrame')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(expectPreviewButton('scenario.editor.autoClick')?.getAttribute('aria-pressed')).toBe(
    'false'
  );
});

it('hides preview toggle controls when capture metadata does not expose frame or click targets', () => {
  renderCanvas(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      target: null,
      cursorPoint: null,
      interactionPoint: null,
    })
  );

  expect(
    container?.querySelector('[data-ui="scenario.editor.workspace.preview-actions"]')
  ).toBeNull();
});

it('adds an auto-derived click overlay and switches the step back to overlay rendering', () => {
  const { onUpdateStep } = renderCanvas(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      target: {
        selector: '#submit',
        iframeSelector: null,
        tagName: 'button',
        role: 'button',
        text: 'Submit',
        ariaLabel: null,
        title: null,
        rect: { x: 10, y: 20, width: 100, height: 40 },
        framePadding: { top: 3, left: 3, right: 3, bottom: 3 },
      },
      cursorPoint: { x: 25, y: 35 },
      overlays: [
        { id: 'manual-focus', kind: 'focus-rect', rect: { x: 0, y: 0, width: 50, height: 20 } },
      ],
      annotationRenderMode: 'asset',
    })
  );

  act(() => {
    expectPreviewButton('scenario.editor.autoClick')?.click();
  });

  expect(onUpdateStep).toHaveBeenCalledWith({
    annotationRenderMode: 'overlays',
    overlays: [
      { id: 'manual-focus', kind: 'focus-rect', rect: { x: 0, y: 0, width: 50, height: 20 } },
      expect.objectContaining({
        kind: 'click-ring',
        point: { x: 25, y: 35 },
        autoSource: 'capture-click',
      }),
    ],
  });
});

it('adds an auto-derived frame overlay using the stored capture padding', () => {
  const { onUpdateStep } = renderCanvas(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      target: {
        selector: '#submit',
        iframeSelector: null,
        tagName: 'button',
        role: 'button',
        text: 'Submit',
        ariaLabel: null,
        title: null,
        rect: { x: 10, y: 20, width: 100, height: 40 },
        framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
      },
      overlays: [],
      annotationRenderMode: 'asset',
    })
  );

  act(() => {
    expectPreviewButton('scenario.editor.autoFrame')?.click();
  });

  expect(onUpdateStep).toHaveBeenCalledWith({
    annotationRenderMode: 'overlays',
    overlays: [
      expect.objectContaining({
        kind: 'focus-rect',
        rect: { x: 4, y: 16, width: 114, height: 54 },
        autoSource: 'capture-target',
      }),
    ],
  });
});

it('removes only the auto-derived click overlay without touching manual click layers', () => {
  const { onUpdateStep } = renderCanvas(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      cursorPoint: { x: 25, y: 35 },
      overlays: [
        {
          id: 'auto-click',
          kind: 'click-ring',
          point: { x: 25, y: 35 },
          autoSource: 'capture-click',
        },
        {
          id: 'manual-click',
          kind: 'click-ring',
          point: { x: 80, y: 90 },
        },
      ],
      annotationRenderMode: 'asset',
    })
  );

  act(() => {
    expectPreviewButton('scenario.editor.autoClick')?.click();
  });

  expect(onUpdateStep).toHaveBeenCalledWith({
    annotationRenderMode: 'overlays',
    overlays: [
      {
        id: 'manual-click',
        kind: 'click-ring',
        point: { x: 80, y: 90 },
      },
    ],
  });
});
