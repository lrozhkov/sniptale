import { expect, it, vi } from 'vitest';

import { reportStartExportFailure } from './failure';

function createState() {
  return {
    cancelRetryRef: {
      current: { exportRunId: 'req-1', owner: 'job', tabIds: [42] } as {
        exportRunId: string;
        owner: 'job' | 'snapshot';
        tabIds: number[];
      } | null,
    },
    requestIdRef: { current: 'req-1' as string | null },
    setProgress: vi.fn(),
  };
}

it('resets the request id and reports a popup export start error', () => {
  const state = createState();

  reportStartExportFailure(state as never, new Error('boom'));

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toBeNull();
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      phase: 'error',
      message: 'Не удалось запустить экспорт. Не удалось связаться с компонентом экспорта.',
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
