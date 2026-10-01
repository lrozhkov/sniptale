import { formatDate } from './date';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createScenarioItem, createVideoProjectItem } from '../test-support/items';
import {
  GalleryProjectDetails,
  GalleryProjectOpenAction,
  getGalleryProjectSummary,
} from './project-presentation';
import { translate } from '../../../platform/i18n';

it.each(['invalid', 'unsupported-engine1'] as const)(
  'explains and disables %s video projects',
  (unavailableReason) => {
    const item = { ...createVideoProjectItem(), unavailableReason };
    const container = document.createElement('div');
    const root = createRoot(container);
    const onOpen = vi.fn();
    act(() => root.render(<GalleryProjectOpenAction item={item} onOpen={onOpen} />));
    expect(getGalleryProjectSummary(item)).toBe(translate('gallery.preview.projectUnavailable'));
    expect(container.querySelector('button')?.disabled).toBe(true);
    act(() => container.querySelector('button')?.click());
    expect(onOpen).not.toHaveBeenCalled();
    act(() => root.unmount());
  }
);

it('disables unavailable scenarios without inventing content counts', () => {
  const item = createScenarioItem();
  item.project.availability = 'unsupported';
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<GalleryProjectOpenAction item={item} onOpen={vi.fn()} />));
  expect(container.querySelector('button')?.disabled).toBe(true);
  expect(getGalleryProjectSummary(item)).toBe(translate('gallery.preview.projectUnavailable'));
  act(() => root.unmount());
});

it.each([createVideoProjectItem(), createScenarioItem()])(
  'hides editor actions for a trashed $type',
  (item) => {
    item.lifecycle = { savedAt: 1, storageClass: 'library', updatedAt: 2, trashedAt: 2 };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<GalleryProjectOpenAction item={item} onOpen={vi.fn()} />));
    expect(container.querySelector('button')).toBeNull();
    expect(getGalleryProjectSummary(item)).toBe(translate('gallery.preview.restoreProjectFirst'));
    act(() => root.unmount());
  }
);

it.each(['compact-grid', 'large-grid'] as const)(
  'prioritizes scenario name and date without editable hints in %s',
  (viewMode) => {
    const item = createScenarioItem();
    item.filename = 'A long scenario name without inventing file metadata';
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <GalleryProjectDetails
          item={item}
          viewMode={viewMode}
          onPreviewOpen={vi.fn()}
          onOpen={vi.fn()}
        />
      )
    );
    expect(container.textContent).toContain(item.filename);
    expect(container.textContent).toContain(formatDate(item.createdAt));
    expect(container.textContent).not.toContain(translate('gallery.preview.editableProject'));
    expect(container.querySelector('button[aria-label]')?.getAttribute('aria-label')).toBe(
      translate('gallery.preview.openInEditor')
    );
    act(() => root.unmount());
  }
);
