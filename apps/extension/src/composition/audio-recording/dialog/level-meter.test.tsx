// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RecordingLevelMeter } from './level-meter';

import { setLocalePreference } from '../../../platform/i18n';

it('reports voice, silence, pause and unavailable input without animating inactive peaks', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await setLocalePreference('en');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const peaks = Array(16).fill(0.7);
  const render = (status: 'voice' | 'silence' | 'paused' | 'unavailable', level: number) =>
    act(() =>
      root.render(<RecordingLevelMeter meter={{ status, level, peaks }} preparing={false} />)
    );
  render('voice', 0.7);
  expect(host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('70');
  expect(host.textContent).toContain('Voice detected');
  render('silence', 0);
  expect(host.textContent).toContain('Silence');
  render('paused', 0.7);
  expect(host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(host.textContent).toContain('Recording paused');
  expect(host.querySelector('[data-audio-peak="0"]')?.getAttribute('style')).toContain(
    'scaleY(0.1)'
  );
  render('unavailable', 0.7);
  expect(host.textContent).toContain('Microphone signal unavailable');
  act(() =>
    root.render(<RecordingLevelMeter meter={{ status: 'voice', level: 0.7, peaks }} preparing />)
  );
  expect(host.textContent).toContain('Preparing microphone');
  await setLocalePreference('ru');
  render('voice', 0.7);
  expect(host.textContent).toContain('Голос поступает');
  expect(host.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe(
    'Уровень микрофона'
  );
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
