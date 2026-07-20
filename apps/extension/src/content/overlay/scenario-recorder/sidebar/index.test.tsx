// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenarioRecorderSidebar } from '.';
import type { ScenarioRecorderSidebarPosition } from './position';
import type { ScenarioRecorderSidebarStep } from './types';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_STEPS: ScenarioRecorderSidebarStep[] = [
  {
    id: 'step-10',
    position: 9,
    previewDataUrl: 'data:image/png;base64,1',
    title: 'Step ten',
  },
  {
    id: 'step-9',
    position: 8,
    previewDataUrl: 'data:image/png;base64,2',
    title: 'Step nine',
  },
];

function createSidebarMetadata(): NonNullable<ScenarioRecorderSidebarStep['metadata']> {
  return {
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
  };
}

async function renderSidebar(
  recentSteps: ScenarioRecorderSidebarStep[] = DEFAULT_STEPS,
  highlightToken = 0,
  forcedHighlightStepId: string | null = null,
  forcedHighlightVersion = 0,
  position: ScenarioRecorderSidebarPosition = { x: 300, y: 96 }
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioRecorderSidebar
        dragging={false}
        onDeleteStep={vi.fn()}
        onFinish={vi.fn()}
        onMoveStep={vi.fn()}
        onOpenEditor={vi.fn()}
        onSidebarHeaderMouseDown={vi.fn()}
        projectName="Scenario"
        position={position}
        recentSteps={recentSteps}
        sidebarRef={{ current: null }}
        highlightToken={highlightToken}
        forcedHighlightStepId={forcedHighlightStepId}
        forcedHighlightVersion={forcedHighlightVersion}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('shows real step numbers and hides trash from the recorder sidebar', async () => {
  await renderSidebar();

  const sidebar = container?.querySelector('[data-ui="content.scenario.sidebar"]');

  expect(container?.textContent).toContain('Step ten');
  expect(container?.textContent).toContain('Step nine');
  expect(container?.textContent).not.toContain('scenario.content.step 10');
  expect(container?.textContent).not.toContain('10 scenario.content.stepsCount');
  expect(container?.textContent).not.toContain('scenario.content.latestStep');
  expect(container?.textContent).not.toContain('scenario.content.trash');
  expect(container?.textContent).not.toContain('scenario.content.sidebar');
  expect(sidebar?.className.includes('backdrop-blur')).toBe(false);
  expect(sidebar instanceof HTMLElement ? sidebar.style.left : '').toBe('300px');
  expect(sidebar instanceof HTMLElement ? sidebar.style.top : '').toBe('96px');
});

it('keeps the preview inside the expanding step card instead of rendering a sidebar overlay', async () => {
  await renderSidebar();

  const preview = container?.querySelector<HTMLImageElement>(
    '[data-ui="content.scenario.sidebar.step-preview"] img'
  );
  expect(preview?.className).toContain('object-contain');
  const previewSurface = container?.querySelector<HTMLElement>(
    '[data-ui="content.scenario.sidebar.step-preview"]'
  );
  expect(previewSurface?.className).toContain('h-[168px]');
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.floating-preview"]')
  ).toBeNull();
});

it('renders hover actions inside the left rail under the step number in the required order', async () => {
  await renderSidebar([
    {
      ...DEFAULT_STEPS[0]!,
      metadata: createSidebarMetadata(),
    },
  ]);

  const rail = container?.querySelector('[data-ui="content.scenario.sidebar.step-rail"]');
  const railActions = container?.querySelector(
    '[data-ui="content.scenario.sidebar.step-rail-actions"]'
  );

  expect(rail?.contains(railActions ?? null)).toBe(true);
  expect(railActions?.className).toContain('flex-col');
  const actionTitles = Array.from(railActions?.querySelectorAll('button') ?? []).map((button) =>
    button.getAttribute('title')
  );
  expect(actionTitles).toEqual([
    'scenario.content.reorderStep',
    'scenario.content.viewMetadata',
    'scenario.content.deleteStep',
  ]);
});

it('animates only newly added steps instead of keeping the first render highlighted forever', async () => {
  await renderSidebar();

  expect(
    container
      ?.querySelector('[data-ui="content.scenario.sidebar.step"]')
      ?.className.includes('animate-[')
  ).toBe(false);

  const nextSteps: ScenarioRecorderSidebarStep[] = [
    {
      id: 'step-11',
      position: 10,
      previewDataUrl: 'data:image/png;base64,3',
      title: 'Step eleven',
    },
    ...DEFAULT_STEPS,
  ];

  await renderSidebar(nextSteps, 1);

  const firstStep = container?.querySelector('[data-ui="content.scenario.sidebar.step"]');
  expect(firstStep?.className.includes('animate-[')).toBe(true);

  act(() => {
    vi.advanceTimersByTime(1900);
  });

  expect(firstStep?.className.includes('animate-[')).toBe(false);
});

it('can start a deferred highlight for the latest step after remount', async () => {
  const nextSteps: ScenarioRecorderSidebarStep[] = [
    {
      id: 'step-11',
      position: 10,
      previewDataUrl: 'data:image/png;base64,3',
      title: 'Step eleven',
    },
    ...DEFAULT_STEPS,
  ];

  await renderSidebar(nextSteps, 1);
  let firstStep = container?.querySelector('[data-ui="content.scenario.sidebar.step"]');
  expect(firstStep?.className.includes('animate-[')).toBe(false);

  await renderSidebar(nextSteps, 0, 'step-11', 1);
  firstStep = container?.querySelector('[data-ui="content.scenario.sidebar.step"]');
  expect(firstStep?.className.includes('animate-[')).toBe(true);

  act(() => {
    vi.advanceTimersByTime(1900);
  });

  expect(firstStep?.className.includes('animate-[')).toBe(false);
});

it('renders every available step instead of trimming the sidebar to the latest seven items', async () => {
  const longStepList = Array.from({ length: 9 }, (_, index) => ({
    id: `step-${index + 1}`,
    position: index,
    previewDataUrl: `data:image/png;base64,${index + 1}`,
    title: `Step ${index + 1}`,
  }));

  await renderSidebar(longStepList);

  expect(container?.querySelectorAll('[data-ui="content.scenario.sidebar.step"]').length).toBe(9);
  expect(container?.textContent).toContain('Step 9');
});

it('opens a fullscreen preview overlay when the user clicks the step preview image', async () => {
  await renderSidebar([
    {
      ...DEFAULT_STEPS[0]!,
      metadata: createSidebarMetadata(),
    },
  ]);

  const previewButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-preview-button"]'
  );
  expect(previewButton?.className).toContain('cursor-zoom-in');

  act(() => {
    previewButton?.click();
  });

  const overlay = container?.querySelector('[data-ui="content.scenario.sidebar.floating-preview"]');
  expect(overlay).not.toBeNull();
  expect((overlay as HTMLDivElement | null)?.style.pointerEvents).toBe('auto');
  expect(overlay?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,1');
  expect(
    overlay?.querySelector('[data-ui="content.scenario.sidebar.floating-preview-close"]')
  ).not.toBeNull();

  act(() => {
    (overlay as HTMLDivElement | null)?.click();
  });

  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.floating-preview"]')
  ).toBeNull();
});

it('closes the fullscreen preview overlay from the explicit close control', async () => {
  await renderSidebar([
    {
      ...DEFAULT_STEPS[0]!,
      metadata: createSidebarMetadata(),
    },
  ]);

  const previewButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-preview-button"]'
  );

  act(() => {
    previewButton?.click();
  });

  const closeButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.floating-preview-close"]'
  );

  act(() => {
    closeButton?.click();
  });

  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.floating-preview"]')
  ).toBeNull();
});
