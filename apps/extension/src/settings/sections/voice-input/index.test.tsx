// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  content: vi.fn(() => null),
  useController: vi.fn(() => ({ marker: 'voice-controller' })),
}));

vi.mock('./content', () => ({ VoiceInputSettingsContent: mocks.content }));
vi.mock('./use-voice-input', () => ({ useVoiceInputSettings: mocks.useController }));

import { VoiceInputSettingsSection } from './index';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('binds the reusable voice-input controller to the Settings consumer', () => {
  act(() => root.render(<VoiceInputSettingsSection />));
  expect(mocks.useController).toHaveBeenCalledOnce();
  expect(mocks.content).toHaveBeenCalledWith({ marker: 'voice-controller' }, undefined);
});
