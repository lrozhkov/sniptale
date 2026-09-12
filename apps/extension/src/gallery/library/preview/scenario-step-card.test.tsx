// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ScenarioPreviewStepCard } from './scenario-step-card';

it('omits a hidden number and renders a custom label as text alongside its title', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const step = {
    id: 'step',
    title: 'Keep title',
    position: 4,
    previewDataUrl: '',
    numberLabel: null,
  };
  try {
    await act(async () => root.render(<ScenarioPreviewStepCard step={step} />));
    expect(host.textContent).toBe('Keep title');
    await act(async () =>
      root.render(<ScenarioPreviewStepCard step={{ ...step, numberLabel: '<b>A.1</b>' }} />)
    );
    expect(host.textContent).toContain('Keep title');
    expect(host.textContent).toContain('<b>A.1</b>');
    expect(host.querySelector('b')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
