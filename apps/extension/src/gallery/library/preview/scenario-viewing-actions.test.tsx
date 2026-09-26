// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/projects/viewing', () => ({
  readScenarioViewingSnapshot: io.snapshot,
}));
vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: ({ projectId, view }: { projectId: string; view: string }) =>
    `https://extension.test/?projectId=${projectId}&view=${view}`,
}));
import { ScenarioViewingActions } from './scenario-viewing-actions';
it('opens both current representations, labels export rows and hides unavailable projects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  io.snapshot.mockResolvedValue({ project: { tour: {} } });
  await act(async () => root.render(<ScenarioViewingActions projectId="p" exportMode />));
  const links = host.querySelectorAll('a');
  expect(links).toHaveLength(2);
  expect(links[0]?.href).toContain('view=guide');
  expect(links[1]?.href).toContain('view=tour');
  expect(links[0]?.target).toBe('_blank');
  expect(host.querySelector('p')).not.toBeNull();
  io.snapshot.mockResolvedValue({ project: {} });
  await act(async () => root.render(<ScenarioViewingActions projectId="guide-only" />));
  expect(host.querySelectorAll('a')).toHaveLength(1);
  io.snapshot.mockResolvedValue(null);
  await act(async () => root.render(<ScenarioViewingActions projectId="deleted" />));
  expect(host.querySelectorAll('a')).toHaveLength(0);
  act(() => root.unmount());
});
