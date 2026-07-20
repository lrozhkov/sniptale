// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioRecorderStepBody, ScenarioRecorderStepRail } from './step-card.parts';
import type { ScenarioRecorderSidebarStep } from './types';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep(overrides?: Partial<ScenarioRecorderSidebarStep>): ScenarioRecorderSidebarStep {
  return {
    id: 'step-1',
    position: 0,
    previewDataUrl: 'data:image/png;base64,1',
    title: 'Step one',
    ...overrides,
  };
}

function renderNode(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function mountPartsTestRoot() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function unmountPartsTestRoot() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}

function createMetadataStep() {
  return createStep({
    metadata: {
      captureMetadata: {
        pointerRange: null,
        scroll: null,
        trigger: 'pointer-up',
      },
      captureSurface: 'visible',
      cursorPoint: null,
      interactionPoint: null,
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      sourceKind: 'manual',
      target: null,
    },
  });
}

function verifiesRailActions() {
  const onDeleteStep = vi.fn();
  const onInspectStep = vi.fn();
  const step = createMetadataStep();

  renderNode(
    <ScenarioRecorderStepRail
      onDeleteStep={onDeleteStep}
      onInspectStep={onInspectStep}
      step={step}
      stepNumber={1}
    />
  );

  const actionTitles = Array.from(container?.querySelectorAll('button') ?? []).map((button) =>
    button.getAttribute('title')
  );

  expect(actionTitles).toEqual([
    'scenario.content.reorderStep',
    'scenario.content.viewMetadata',
    'scenario.content.deleteStep',
  ]);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.step-info"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.step-delete"]')
      ?.click();
  });

  expect(onInspectStep).toHaveBeenCalledWith(step);
  expect(onDeleteStep).toHaveBeenCalledWith('step-1');
}

function verifiesPreviewOpen() {
  const onPreviewOpen = vi.fn();
  const step = createStep({ title: '' });

  renderNode(<ScenarioRecorderStepBody onPreviewOpen={onPreviewOpen} step={step} />);

  expect(container?.textContent).toContain('step-1');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.step-preview-button"]')
      ?.click();
  });

  expect(onPreviewOpen).toHaveBeenCalledWith(step);
}

describe('ScenarioRecorderStepRail', () => {
  beforeEach(mountPartsTestRoot);
  afterEach(unmountPartsTestRoot);

  it(
    'renders action buttons in the required order and wires info/delete callbacks',
    verifiesRailActions
  );
});

describe('ScenarioRecorderStepBody', () => {
  beforeEach(mountPartsTestRoot);
  afterEach(unmountPartsTestRoot);

  it(
    'opens the preview from the preview button and falls back to the step id when title is empty',
    verifiesPreviewOpen
  );
});
