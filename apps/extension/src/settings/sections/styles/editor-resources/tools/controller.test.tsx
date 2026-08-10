// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actions: { deletePreset: vi.fn() },
  createToolPresetActions: vi.fn(),
  state: {
    sceneBackground: { defaultPresetId: 'scene-default', presets: [{ id: 'scene-default' }] },
    step: { defaultPresetId: 'step-default', presets: [{ id: 'step-default' }] },
  },
}));
vi.mock('../storage', () => ({ useEditorPresetStorageState: () => mocks.state }));
vi.mock('./actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./actions')>()),
  createToolPresetActions: mocks.createToolPresetActions,
}));

import { useToolPresetsController } from './controller';

let latest: ReturnType<typeof useToolPresetsController> | null = null;

function Harness() {
  latest = useToolPresetsController();
  return null;
}

afterEach(() => {
  latest = null;
  document.body.replaceChildren();
});

it('starts on current step presets and switches to scene background presets', () => {
  mocks.createToolPresetActions.mockReturnValue(mocks.actions);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  expect(latest?.selection.owner).toBe('step');
  expect(latest?.collection.defaultPresetId).toBe('step-default');
  expect(mocks.createToolPresetActions).toHaveBeenLastCalledWith({
    currentPresets: mocks.state.step.presets,
    owner: 'step',
  });

  act(() => latest?.selection.setOwner('sceneBackground'));
  expect(latest?.selection.owner).toBe('sceneBackground');
  expect(latest?.collection.defaultPresetId).toBe('scene-default');
  expect(latest?.actions).toBe(mocks.actions);
  act(() => root.unmount());
});
