// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RecordingLevelMeter } from './level-meter';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('reports voice, silence, pause and unavailable input without animating inactive peaks', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  expect(host.textContent).toContain('recordAudioSignal.voice');
  render('silence', 0);
  expect(host.textContent).toContain('recordAudioSignal.silence');
  render('paused', 0.7);
  expect(host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(host.textContent).toContain('recordAudioSignal.paused');
  expect(host.querySelector('[data-audio-peak="0"]')?.getAttribute('style')).toContain(
    'scaleY(0.1)'
  );
  render('unavailable', 0.7);
  expect(host.textContent).toContain('recordAudioSignal.unavailable');
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
