// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';

vi.mock('./page', () => ({
  ScenarioV3EditorPage: () => <div data-testid="scenario-v3-page">v3 page</div>,
}));
vi.mock('../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: vi.fn(async () => ({
    defaultModelId: 'model-1',
    models: [],
    providers: [],
  })),
}));
import { ScenarioEditorPage } from './ScenarioEditorPage';
import { ScenarioV3EditorShell } from './view';

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

describe('ScenarioEditorPage', () => {
  registerPageRouteTest();
  registerFloatingToolRouteTest();
});

function registerPageRouteTest() {
  it('routes the production scenario editor page to the v3 slide canvas editor', () => {
    act(() => {
      root?.render(<ScenarioEditorPage />);
    });

    expect(container?.querySelector('[data-testid="scenario-v3-page"]')).not.toBeNull();
  });
}

function registerFloatingToolRouteTest() {
  it('routes v3 shell floating tools through their canonical panels', () => {
    const retrySave = vi.fn(async () => null);
    act(() => {
      root?.render(
        <ScenarioV3EditorShell
          project={createScenarioProjectV3('Inspector route')}
          saveStatus={{ error: 'Quota exceeded', retrySave, state: 'error' }}
        />
      );
    });

    expect(container?.textContent).toContain('Quota exceeded');
    expect(getButton(translate('scenario.editor.toggleGrid'))).toBeNull();

    clickButton(translate('scenario.editor.export'));
    expect(container?.querySelector('[data-ui="scenario.inspector.export-tool"]')).not.toBeNull();
  });
}

function clickButton(label: string) {
  const button = getButton(label);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function getButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"], [title="${label}"]`);
}
