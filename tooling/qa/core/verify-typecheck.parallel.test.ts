import { expect, it, vi } from 'vitest';

import { runTypecheckProjectGraph } from './verify-typecheck.mjs';

function deferred() {
  let resolve!: (value: { status: number; stdout: string; stderr: string }) => void;
  const promise = new Promise<{ status: number; stdout: string; stderr: string }>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

it('runs independent owner projects in a bounded dependency-aware wave', async () => {
  const content = deferred();
  const popup = deferred();
  const contentTests = deferred();
  const started: string[] = [];
  const projectRunner = vi.fn((projectId: string) => {
    started.push(projectId);
    return { content, popup, 'content-tests': contentTests }[projectId]!.promise;
  });
  const result = runTypecheckProjectGraph({
    maxConcurrency: 2,
    projectIds: ['content', 'popup', 'content-tests'],
    projectRunner,
  });

  await vi.waitFor(() => expect(started).toEqual(['content', 'popup']));
  popup.resolve({ status: 0, stdout: 'popup\n', stderr: '' });
  expect(started).toEqual(['content', 'popup']);
  content.resolve({ status: 0, stdout: 'content\n', stderr: '' });
  await vi.waitFor(() => expect(started).toContain('content-tests'));
  contentTests.resolve({ status: 0, stdout: 'tests\n', stderr: '' });

  await expect(result).resolves.toEqual({
    status: 0,
    stdout: 'content\npopup\ntests\n',
    stderr: '',
  });
});
