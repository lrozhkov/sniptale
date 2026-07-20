// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import { ScenarioEditorStepCardHeader } from './ScenarioEditorStepCardHeader';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHeader(step: ScenarioStep = createScenarioCaptureStep({ assetId: 'asset-1' })) {
  const callbacks = {
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onInspect: vi.fn(),
    onMoveDown: vi.fn(),
    onMoveUp: vi.fn(),
    onRedo: vi.fn(),
    onUndo: vi.fn(),
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ScenarioEditorStepCardHeader
        canRedo
        canUndo
        index={0}
        onDelete={callbacks.onDelete}
        onDuplicate={callbacks.onDuplicate}
        onInspect={callbacks.onInspect}
        onMoveDown={callbacks.onMoveDown}
        onMoveUp={callbacks.onMoveUp}
        onRedo={callbacks.onRedo}
        onUndo={callbacks.onUndo}
        step={step}
      />
    );
  });

  return callbacks;
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

it('shows metadata actions for capture steps instead of quick edit controls', () => {
  const callbacks = renderHeader();

  act(() => {
    container?.querySelector<HTMLButtonElement>('[title="scenario.content.viewMetadata"]')?.click();
  });

  expect(callbacks.onInspect).toHaveBeenCalledTimes(1);
  expect(container?.querySelector('[title="scenario.editor.quickEdit"]')).toBeNull();
});

it('hides the metadata action for non-capture steps', () => {
  renderHeader(createScenarioNoteStep({ title: 'Note' }));

  expect(container?.querySelector('[title="scenario.content.viewMetadata"]')).toBeNull();
});

it('keeps disabled undo and redo actions inert', () => {
  const callbacks = renderHeader();

  act(() => {
    root?.render(
      <ScenarioEditorStepCardHeader
        canRedo={false}
        canUndo={false}
        index={1}
        onDelete={callbacks.onDelete}
        onDuplicate={callbacks.onDuplicate}
        onInspect={callbacks.onInspect}
        onMoveDown={callbacks.onMoveDown}
        onMoveUp={callbacks.onMoveUp}
        onRedo={callbacks.onRedo}
        onUndo={callbacks.onUndo}
        step={createScenarioNoteStep({ title: 'Disabled note' })}
      />
    );
  });

  act(() => {
    container?.querySelector<HTMLButtonElement>('[title="scenario.editor.undo"]')?.click();
    container?.querySelector<HTMLButtonElement>('[title="scenario.editor.redo"]')?.click();
  });

  expect(callbacks.onUndo).not.toHaveBeenCalled();
  expect(callbacks.onRedo).not.toHaveBeenCalled();
});

it('renders section labels through the shared step-kind resolver', () => {
  renderHeader(createScenarioSectionStep({ title: 'Section' }));

  expect(container?.textContent).toContain('scenario.editor.stepKinds.section');
});
