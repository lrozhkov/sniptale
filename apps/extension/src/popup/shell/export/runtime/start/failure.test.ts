import { expect, it, vi } from 'vitest';

import { reportStartExportFailure } from './failure';

function createState() {
  return {
    requestIdRef: { current: 'req-1' },
    setProgress: vi.fn(),
  };
}

it('resets the request id and reports a popup export start error', () => {
  const state = createState();

  reportStartExportFailure(state as never, new Error('boom'));

  expect(state.requestIdRef.current).toBeNull();
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      phase: 'error',
      message: 'boom',
    })
  );
});

it('normalizes stale page runtime failures into a refresh hint', () => {
  const state = createState();

  reportStartExportFailure(
    state as never,
    new Error('Could not establish connection. Receiving end does not exist.')
  );

  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      message:
        'Страница использует устаревшую версию расширения. Обновите страницу и повторите действие.',
    })
  );
});
