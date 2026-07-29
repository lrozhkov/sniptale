import { beforeEach, expect, it, vi } from 'vitest';

const { executeScriptMock } = vi.hoisted(() => ({ executeScriptMock: vi.fn() }));

vi.mock('@sniptale/platform/browser/scripting', () => ({
  browserScripting: { executeScript: executeScriptMock },
}));

import { readViewportCapacity } from './viewport-capacity';

beforeEach(() => {
  vi.clearAllMocks();
});

it('reads the live CSS viewport without debugger access', async () => {
  executeScriptMock.mockResolvedValue([{ result: { width: 1365.75, height: 767.5 } }]);

  await expect(readViewportCapacity(7)).resolves.toEqual({ width: 1365, height: 767 });
  expect(executeScriptMock).toHaveBeenCalledWith({
    target: { tabId: 7 },
    func: expect.any(Function),
  });
});

it.each([
  { results: [] },
  { results: [{ result: null }] },
  { results: [{ result: { width: 0, height: 720 } }] },
])('rejects missing or invalid live viewport metrics', async ({ results }) => {
  executeScriptMock.mockResolvedValue(results);
  await expect(readViewportCapacity(7)).rejects.toThrow('metrics are unavailable');
});
