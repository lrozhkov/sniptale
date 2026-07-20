// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExportFooterSnapshotButton } from './snapshot-button';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('renders save, open, gallery, and saving icon states', () => {
  const onClick = vi.fn();

  act(() => {
    root?.render(
      <>
        <ExportFooterSnapshotButton
          disabled={false}
          isSaving={false}
          onClick={onClick}
          title="Save"
        />
        <ExportFooterSnapshotButton
          disabled={false}
          isSaving={false}
          mode="open"
          onClick={onClick}
          title="Open"
        />
        <ExportFooterSnapshotButton
          disabled={false}
          isSaving={false}
          mode="gallery"
          onClick={onClick}
          title="Gallery"
        />
        <ExportFooterSnapshotButton disabled={false} isSaving onClick={onClick} title="Saving" />
      </>
    );
  });

  expect(container?.querySelector('.lucide-archive')).not.toBeNull();
  expect(container?.querySelector('.lucide-external-link')).not.toBeNull();
  expect(container?.querySelector('.lucide-images')).not.toBeNull();
  expect(container?.querySelector('.lucide-loader-circle')).not.toBeNull();
});
