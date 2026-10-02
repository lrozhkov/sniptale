// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/projects/viewing', () => ({
  readScenarioViewingSnapshot: io.snapshot,
}));
vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: ({ projectId, view }: { projectId: string; view?: string }) =>
    `https://extension.test/?projectId=${projectId}${view ? `&view=${view}` : ''}`,
}));
import { ScenarioViewingActions } from './scenario-viewing-actions';
it('opens the current source project from an export row and hides unavailable projects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  io.snapshot.mockResolvedValue({ project: { tour: {} } });
  await act(async () =>
    root.render(
      <ScenarioViewingActions
        projectId="p"
        exportEntry={{
          id: 'export',
          projectId: 'p',
          filename: 'old.html',
          format: 'html',
          size: 4,
          createdAt: 1,
        }}
      />
    )
  );
  const links = host.querySelectorAll('a');
  expect(links).toHaveLength(1);
  expect(links[0]?.href).toContain('projectId=p');
  expect(links[0]?.href).not.toContain('view=');
  expect(links[0]?.target).toBe('_blank');
  expect(host.textContent).toMatch(/Открыть текущий проект|Open current project/);
  io.snapshot.mockResolvedValue({ project: {} });
  await act(async () => root.render(<ScenarioViewingActions projectId="guide-only" />));
  expect(host.querySelectorAll('a')).toHaveLength(1);
  io.snapshot.mockResolvedValue(null);
  await act(async () => root.render(<ScenarioViewingActions projectId="deleted" />));
  expect(host.querySelectorAll('a')).toHaveLength(0);
  act(() => root.unmount());
});

it('drops stale availability when the inspected project or committed revision changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let finishFirst!: (value: unknown) => void;
  io.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFirst = resolve;
      })
  );
  await act(async () => root.render(<ScenarioViewingActions projectId="first" revision={1} />));
  io.snapshot.mockResolvedValueOnce({ project: { tour: {} } });
  await act(async () => root.render(<ScenarioViewingActions projectId="second" revision={1} />));
  expect(host.querySelectorAll('a')).toHaveLength(2);
  await act(async () => finishFirst({ project: {} }));
  expect(host.querySelectorAll('a')).toHaveLength(2);
  io.snapshot.mockResolvedValueOnce({ project: {} });
  await act(async () => root.render(<ScenarioViewingActions projectId="second" revision={2} />));
  expect(host.querySelectorAll('a')).toHaveLength(1);
  await act(async () =>
    root.render(
      <ScenarioViewingActions projectId="second" revision={2} availability="unavailable" />
    )
  );
  expect(host.querySelectorAll('a')).toHaveLength(0);
  act(() => root.unmount());
});
