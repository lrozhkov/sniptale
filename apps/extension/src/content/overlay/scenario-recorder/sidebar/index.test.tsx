// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenarioRecorderSidebar } from '.';
import type { ScenarioRecorderSidebarPosition } from './position';
import type { ScenarioRecorderSidebarStep } from './types';
import type { ScenarioSidebarControlsProps } from './controls';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const onDeleteStep = vi.fn();
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_STEPS: ScenarioRecorderSidebarStep[] = [
  {
    id: 'step-10',
    position: 9,
    numberLabel: '10',
    previewDataUrl: 'data:image/png;base64,1',
    title: 'Step ten',
  },
  {
    id: 'step-9',
    position: 8,
    numberLabel: '9',
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
  position: ScenarioRecorderSidebarPosition = { x: 300, y: 96 },
  controls: Partial<ScenarioSidebarControlsProps & { pendingProjectSelection: boolean }> = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioRecorderSidebar
        byClickDisabled={false}
        captureMode="manual"
        onCreateProject={vi.fn(async () => undefined)}
        onProjectSelect={vi.fn(async () => undefined)}
        onSetCaptureMode={vi.fn(async () => undefined)}
        projectId="project-1"
        projects={[]}
        pendingProjectSelection={false}
        {...controls}
        dragging={false}
        onDeleteStep={onDeleteStep}
        onFinish={vi.fn()}
        onCollapse={vi.fn()}
        onCaptureVisible={vi.fn(async () => undefined)}
        captureBusy={false}
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
  onDeleteStep.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

it('keeps project selection and capture mode inside the panel', async () => {
  const onSetCaptureMode = vi.fn(async () => undefined);
  const onProjectSelect = vi.fn(async () => undefined);
  await renderSidebar(
    [],
    0,
    null,
    0,
    { x: 300, y: 96 },
    {
      onSetCaptureMode,
      onProjectSelect,
      projects: [{ id: 'project-2', name: 'Another project' }],
    }
  );

  expect(container?.textContent).toContain('scenario.content.sidebarEmpty');
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.scenario.sidebar.capture-mode.by-click"]'
      )
      ?.click();
  });
  expect(onSetCaptureMode).toHaveBeenCalledWith('by-click');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.project-button"]')
      ?.click();
  });
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.scenario.sidebar.project-picker.project"]'
      )
      ?.click();
  });
  expect(onProjectSelect).toHaveBeenCalledWith('project-2');
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).toBeNull();
});

it('opens project selection when a captured step awaits a project', async () => {
  await renderSidebar(
    [],
    0,
    null,
    0,
    { x: 300, y: 96 },
    {
      pendingProjectSelection: true,
    }
  );

  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();
});

it('retains the chooser on a failed project switch and disables by-click during editing', async () => {
  const onProjectSelect = vi.fn(async () => {
    throw new Error('Unavailable');
  });
  await renderSidebar(
    [],
    0,
    null,
    0,
    { x: 300, y: 96 },
    {
      byClickDisabled: true,
      onProjectSelect,
      projects: [{ id: 'project-2', name: 'Another project' }],
    }
  );
  expect(
    container?.querySelector<HTMLButtonElement>(
      '[data-ui="content.scenario.sidebar.capture-mode.by-click"]'
    )?.disabled
  ).toBe(true);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.project-button"]')
      ?.click();
  });
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.scenario.sidebar.project-picker.project"]'
      )
      ?.click();
  });
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();
  expect(container?.textContent).toContain('Scenario');
});

it('dismisses the project chooser with Escape or an outside pointer press', async () => {
  await renderSidebar();
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.project-button"]'
  );
  act(() => trigger?.click());
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).toBeNull();

  act(() => trigger?.click());
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).toBeNull();
});

it('closes project selection before opening step confirmation so Escape closes the dialog', async () => {
  await renderSidebar();
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.project-button"]')
      ?.click()
  );
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).not.toBeNull();

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.step-delete"]')
      ?.click();
  });
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.project-picker"]')
  ).toBeNull();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(onDeleteStep).not.toHaveBeenCalled();
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
    'scenario.content.moveStepUp',
    'scenario.content.moveStepDown',
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
      numberLabel: '11',
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
      numberLabel: '11',
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
    numberLabel: String(index + 1),
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

it('requires confirmation and preserves the step when deletion is cancelled', async () => {
  await renderSidebar();
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-delete"]'
  );
  if (!trigger) throw new Error('Missing delete action');
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  expect(onDeleteStep).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain('scenario.content.deleteStepMessage');
  const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === 'common.actions.cancel'
  );
  if (!cancel) throw new Error('Missing cancel action');
  await act(async () => {
    cancel.click();
  });
  expect(onDeleteStep).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => {
    trigger.click();
  });
  const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find(
    (button) => button.textContent === 'common.actions.delete'
  );
  if (!(confirm instanceof HTMLButtonElement)) throw new Error('Missing confirm action');
  await act(async () => {
    confirm.click();
  });
  expect(onDeleteStep).toHaveBeenCalledExactlyOnceWith('step-10');
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it('cancels deletion with Escape and ignores a target removed while confirmation is open', async () => {
  await renderSidebar();
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-delete"]'
  );
  if (!trigger) throw new Error('Missing delete action');
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(onDeleteStep).not.toHaveBeenCalled();
  await act(async () => {
    trigger.click();
  });
  await renderSidebar([]);
  const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find(
    (button) => button.textContent === 'common.actions.delete'
  );
  if (!(confirm instanceof HTMLButtonElement)) throw new Error('Missing confirm action');
  await act(async () => {
    confirm.click();
  });
  expect(onDeleteStep).not.toHaveBeenCalled();
});

it('keeps manual capture concise and exposes the panel capture action', async () => {
  await renderSidebar();
  expect(container?.textContent).not.toContain('scenario.content.modeManualHint');
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.capture-visible"]')
  ).not.toBeNull();
});
