import { expect, it, vi } from 'vitest';
import { changeRecordedClicks, changeRecordedKeys } from './action-presentation';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';

it('admits authored presentation only when editing is available, retaining the event selection', () => {
  const state = {
    busy: false,
    editing: { exporter: { phase: 'idle' } },
    canStart: vi.fn(() => true),
    advanced: createQuickEditAdvancedState(),
    setMode: vi.fn(),
    setActiveSelection: vi.fn(),
    activeSelection: { kind: 'telemetry', ref: { kind: 'action', id: 'key' } },
    setMessage: vi.fn(),
    setClickAnimations: vi.fn(),
    setKeyAnimations: vi.fn(),
  } as unknown as Parameters<typeof changeRecordedKeys>[0];
  changeRecordedKeys(state, ['key'], { enabled: true });
  expect(state.setKeyAnimations).toHaveBeenCalledOnce();
  expect(state.setMode).toHaveBeenCalledWith('advanced');
  expect(state.setActiveSelection).toHaveBeenCalledWith(state.activeSelection);
  const update = vi.mocked(state.setKeyAnimations).mock.calls[0]![0];
  expect(update([])).toMatchObject([{ id: 'key', enabled: true }]);
  state.advanced.ui.mode = 'advanced';
  changeRecordedKeys(state, ['key'], { offset: 0.1 });
  changeRecordedKeys(state, ['key'], null);
  expect(vi.mocked(state.setKeyAnimations).mock.calls[2]![0](update([]))).toEqual([]);
  expect(state.setMode).toHaveBeenCalledTimes(1);
  changeRecordedKeys(state, ['key'], { after: NaN });
  expect(state.setMessage).toHaveBeenCalledOnce();
  state.busy = true;
  changeRecordedKeys(state, ['key'], { enabled: true });
  expect(state.setKeyAnimations).toHaveBeenCalledTimes(3);
  state.busy = false;
  state.canStart = () => false;
  changeRecordedKeys(state, ['key'], { enabled: true });
  expect(state.setKeyAnimations).toHaveBeenCalledTimes(3);
  state.canStart = () => true;
  state.advanced.ui.mode = 'basic';
  changeRecordedClicks(state, ['click'], { effect: 'ripple' });
  expect(vi.mocked(state.setClickAnimations).mock.calls[0]![0]([])).toMatchObject([
    { id: 'click', effect: 'ripple' },
  ]);
  changeRecordedClicks(state, ['click'], { after: NaN });
  expect(state.setMessage).toHaveBeenCalledTimes(2);
});
