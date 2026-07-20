// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoProjectTransition } from '../../../../../../features/video/project/types';
import { TransitionTemplateActions } from './transition-template-actions';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createTransition(): VideoProjectTransition {
  return {
    direction: 'RIGHT',
    duration: 0.8,
    easing: 'EASE_IN_OUT',
    highlightColor: '#f97316',
    id: 'transition-1',
    intensity: 'BOLD',
    kind: 'LIGHT_SWEEP',
    leadingClipId: 'clip-a',
    renderKind: 'CSS_LIKE',
    templateKind: 'LIGHT_SWEEP',
    trailingClipId: 'clip-b',
  } as VideoProjectTransition;
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

describe('workspace-sidebar/selection/effects/transition-template-actions', () => {
  it('renders quick actions through shared compact action buttons and keeps callbacks', async () => {
    const onUpdateTransitionDuration = vi.fn();
    const onUpdateTransitionTemplate = vi.fn();

    await act(async () => {
      root?.render(
        <TransitionTemplateActions
          transition={createTransition()}
          onUpdateTransitionDuration={onUpdateTransitionDuration}
          onUpdateTransitionTemplate={onUpdateTransitionTemplate}
        />
      );
    });

    const resetStyle = findButton('videoEditor.sidebar.transitionResetStyleAction');
    const resetTiming = findButton('videoEditor.sidebar.transitionResetTimingAction');

    expect(resetStyle?.className).toContain('hover:bg-[color:color-mix');
    expect(resetTiming?.className).toContain('rounded-[12px]');

    await act(async () => {
      resetTiming?.click();
    });

    expect(onUpdateTransitionDuration).toHaveBeenCalledWith('transition-1', expect.any(Number));
  });
});
