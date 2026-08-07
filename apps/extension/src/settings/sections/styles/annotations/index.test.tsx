// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./borders', () => ({ HighlighterSection: () => <div>borders-owner</div> }));
vi.mock('./callouts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./callouts')>()),
  useCalloutPresetCatalogController: () => ({}),
  CalloutPresetCatalogSettings: () => <div>callouts-owner</div>,
}));
vi.mock('./numbering', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./numbering')>()),
  useStepBadgePresetCatalogController: () => ({}),
  StepBadgePresetCatalogSettings: () => <div>numbering-owner</div>,
}));
import { AnnotationsSection } from '.';

it('renders only the selected annotation owner', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AnnotationsSection view="numbering" />));
  expect(container.textContent).toContain('numbering-owner');
  expect(container.textContent).not.toContain('borders-owner');
  act(() => root.unmount());
});

it('defaults to borders and renders callouts independently', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AnnotationsSection />));
  expect(container.textContent).toContain('borders-owner');
  act(() => root.render(<AnnotationsSection view="callouts" />));
  expect(container.textContent).toContain('callouts-owner');
  expect(container.textContent).not.toContain('numbering-owner');
  act(() => root.unmount());
});
