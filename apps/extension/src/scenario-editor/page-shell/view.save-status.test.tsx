// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { ScenarioV3EditorShell } from './view';

const shellContentPropsMock = vi.hoisted(() => vi.fn());

vi.mock('./shell-content', () => ({
  ScenarioV3EditorShellContent: (props: unknown) => {
    shellContentPropsMock(props);
    return <div data-testid="scenario-shell-content" />;
  },
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
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('passes page save status into the scenario shell content seam', () => {
  const retrySave = vi.fn(async () => undefined);

  act(() => {
    root?.render(
      <ScenarioV3EditorShell
        project={createScenarioProjectV3('Save status')}
        saveStatus={{ error: 'Quota exceeded', retrySave, state: 'error' }}
      />
    );
  });

  expect(shellContentPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      saveStatus: { error: 'Quota exceeded', retrySave, state: 'error' },
    })
  );
});
