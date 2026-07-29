// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../application/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/runtime-services/services')>()),
  getContentRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage },
  }),
}));

import { useViewportSelectorPresets } from './presets';

const preset = {
  kind: 'user' as const,
  id: 'viewport-1',
  name: 'Viewport',
  target: 'viewport' as const,
  width: 1280,
  height: 720,
  enabled: true,
  order: 0,
};

let container: HTMLDivElement;
let root: Root;

function Harness({ active }: { active: boolean }) {
  const state = useViewportSelectorPresets(active);
  return <output data-count={state.availabilityById.size}>{state.presets.length}</output>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [preset] });
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    availabilities: [
      {
        status: 'available',
        presetId: preset.id,
        target: preset.target,
        required: { width: preset.width, height: preset.height },
      },
    ],
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(active: boolean) {
  await act(async () => {
    root.render(<Harness active={active} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

it('runs one batch availability query only while the menu is opened', async () => {
  await render(false);
  expect(mocks.loadSettings).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();

  await render(true);
  expect(mocks.loadSettings).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'GET_VIEWPORT_PRESET_AVAILABILITY',
    presetIds: [preset.id],
  });
  expect(container.querySelector('output')?.dataset['count']).toBe('1');

  await render(true);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
});
