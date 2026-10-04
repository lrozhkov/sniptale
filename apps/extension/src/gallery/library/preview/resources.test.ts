import { expect, it, vi } from 'vitest';
import { createPreviewResources } from './resources';

it('holds the presented URL, releases abandoned requests, and ignores stale terminal acknowledgements', () => {
  const revoke = vi.fn();
  const resources = createPreviewResources(revoke);
  resources.begin(1);
  resources.offer(1, 'blob:a');
  resources.acknowledge({ requestRevision: 1, url: 'blob:a', outcome: 'presented' });
  resources.begin(2);
  resources.offer(2, 'blob:b');
  expect(revoke).not.toHaveBeenCalled();
  resources.begin(3);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:b');
  resources.acknowledge({ requestRevision: 2, url: null, outcome: 'terminal' });
  resources.offer(2, 'blob:late');
  expect(revoke).not.toHaveBeenCalledWith('blob:a');
  expect(revoke).toHaveBeenCalledWith('blob:late');
  resources.offer(3, 'blob:c');
  resources.acknowledge({ requestRevision: 3, url: 'blob:wrong', outcome: 'presented' });
  expect(revoke).not.toHaveBeenCalledWith('blob:a');
  resources.acknowledge({ requestRevision: 3, url: 'blob:c', outcome: 'presented' });
  expect(revoke).toHaveBeenCalledWith('blob:a');
  resources.dispose();
  resources.dispose();
  expect(revoke.mock.calls.map(([url]) => url)).toEqual([
    'blob:b',
    'blob:late',
    'blob:a',
    'blob:c',
  ]);
});

it('releases both held URLs on terminal failure or closing during preparation', () => {
  for (const close of [false, true]) {
    const revoke = vi.fn();
    const resources = createPreviewResources(revoke);
    resources.begin(1);
    resources.offer(1, 'blob:a');
    resources.acknowledge({ requestRevision: 1, url: 'blob:a', outcome: 'presented' });
    resources.begin(2);
    resources.offer(2, 'blob:b');
    if (close) resources.dispose();
    else resources.acknowledge({ requestRevision: 2, url: null, outcome: 'terminal' });
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:a', 'blob:b']);
  }
});
