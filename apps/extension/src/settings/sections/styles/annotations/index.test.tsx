// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';

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
vi.mock('./tags', () => ({ AnnotationTemplateTagsSettings: () => <div>tags-owner</div> }));
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

it('renders the shared tag manager as an independent annotation tab', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AnnotationsSection view="tags" />));
  expect(container.textContent).toContain('tags-owner');
  expect(container.textContent).not.toContain('borders-owner');
  act(() => root.unmount());
});

it('routes the tags tab through the shared view navigation contract', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onViewChange = vi.fn();
  act(() => root.render(<AnnotationsSection view="borders" onViewChange={onViewChange} />));
  const tagsButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === translate('settings.navigation.views.tags')
  );
  act(() => tagsButton?.click());
  expect(onViewChange).toHaveBeenCalledWith('tags');
  act(() => root.unmount());
});
