// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ webSnapshotEnabled: true }));
vi.mock('./controller', () => ({ useWebSnapshotsController: () => state }));
vi.mock('./content', () => ({
  WebSnapshotsContent: (props: { state: unknown }) => (
    <div data-state={props.state === state ? 'canonical' : 'unexpected'} />
  ),
}));
import { WebSnapshotsSection } from '.';

it('composes the Web Snapshot controller with its owned surface', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<WebSnapshotsSection />));
  expect(container.querySelector('[data-state="canonical"]')).not.toBeNull();
  act(() => root.unmount());
});
