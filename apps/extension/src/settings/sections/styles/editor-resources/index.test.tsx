// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('./content', () => ({
  EditorResourcesContent: ({ view }: { view?: string }) => <div>{view}</div>,
}));
import { EditorResourcesSection } from '.';
it('forwards route view to the editor resources composition owner', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<EditorResourcesSection view="tools" />));
  expect(node.textContent).toBe('tools');
  act(() => root.unmount());
});
