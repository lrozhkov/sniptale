import { afterEach, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  getFrameSessionBorderPreset,
  initializeFrameSessionBorderPreset,
  resetFrameSessionBorderPreset,
  setFrameSessionBorderPreset,
} from './border-preset';

afterEach(() => {
  resetFrameSessionBorderPreset();
});

it('does not let deferred default initialization overwrite an explicit tab choice', () => {
  const selectedPreset = { ...DEFAULT_BORDER_PRESET, id: 'explicit', name: 'Explicit' };
  const persistedDefault = { ...DEFAULT_BORDER_PRESET, id: 'persisted', name: 'Persisted' };

  setFrameSessionBorderPreset(selectedPreset);
  initializeFrameSessionBorderPreset(persistedDefault);

  expect(getFrameSessionBorderPreset()).toMatchObject({ id: 'explicit' });
});

it('owns one cloned border preset for the current content document', () => {
  const selectedPreset = {
    ...DEFAULT_BORDER_PRESET,
    id: 'tab-selection',
    name: 'Tab selection',
    padding: { bottom: 7, left: 6, right: 5, top: 4 },
  };

  setFrameSessionBorderPreset(selectedPreset);
  selectedPreset.padding.top = 99;

  const storedPreset = getFrameSessionBorderPreset();
  expect(storedPreset).toMatchObject({ id: 'tab-selection', padding: { top: 4 } });

  storedPreset.padding.top = 88;
  expect(getFrameSessionBorderPreset().padding.top).toBe(4);
});
