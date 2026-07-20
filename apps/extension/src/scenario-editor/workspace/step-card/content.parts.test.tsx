// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import type { ScenarioDividerStep } from '../../../features/scenario/contracts/types/project';
import {
  CaptureStepContent,
  DividerStepContent,
  NoteStepContent,
  SectionStepContent,
} from './content.parts';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../capture-canvas/view', () => ({
  ScenarioWorkspaceCaptureCanvas: () => <div data-testid="workspace-canvas" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

function renderPart(element: React.ReactElement) {
  act(() => {
    root?.render(element);
  });
}

function createDividerStep(overrides: Partial<ScenarioDividerStep> = {}): ScenarioDividerStep {
  return {
    id: 'divider-1',
    kind: 'divider',
    title: '',
    body: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('content.parts', () => {
  it('renders capture fields and embedded canvas preview', () => {
    renderPart(
      <CaptureStepContent
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture', body: 'Body' })}
      />
    );

    expect(container?.querySelector('input')).not.toBeNull();
    expect(container?.querySelector('textarea')).not.toBeNull();
    expect(container?.querySelector('[data-testid="workspace-canvas"]')).not.toBeNull();
  });

  it('renders section and divider copy editors only when their content contracts require them', () => {
    renderPart(
      <SectionStepContent
        onUpdateStep={vi.fn()}
        step={createScenarioSectionStep({ title: 'Section', body: 'Hidden' })}
      />
    );

    expect(container?.querySelectorAll('input')).toHaveLength(1);
    expect(container?.querySelector('textarea')).toBeNull();

    renderPart(
      <DividerStepContent
        onUpdateStep={vi.fn()}
        step={createDividerStep({ title: 'Divider title', body: 'Divider body' })}
      />
    );

    expect(container?.querySelectorAll('input')).toHaveLength(2);
  });

  it('renders note tone chrome and surfaces the translated tone button label', () => {
    renderPart(
      <NoteStepContent
        onUpdateStep={vi.fn()}
        step={createScenarioNoteStep({ title: 'Warning note', tone: 'warning' })}
      />
    );

    expect(container?.textContent).toContain('scenario.editor.noteTone.warning');
    expect(container?.querySelector('textarea')).not.toBeNull();
  });
});
