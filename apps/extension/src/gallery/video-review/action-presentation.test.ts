import { expect, it, vi } from 'vitest';
import {
  changeRecordedClicks,
  changeRecordedKeys,
  changeRecordedActionAudio,
} from './action-presentation';

it('flushes before one functional typed audio batch and blocks failure or concurrent admission', async () => {
  const state = {
    busy: false,
    editing: { exporter: { phase: 'idle' } },
    canStart: vi.fn(() => true),
    advanced: createQuickEditAdvancedState(),
    setMode: vi.fn(),
    setActiveSelection: vi.fn(),
    activeSelection: { kind: 'telemetry', ref: { kind: 'signal', id: 'same' } },
    setMessage: vi.fn(),
    setClickAnimations: vi.fn(),
    setKeyAnimations: vi.fn(),
    setActionAudio: vi.fn(),
    flushAdvanced: vi.fn(async () => undefined),
    performAction: async (action: () => Promise<boolean>) => await action(),
  } as unknown as Parameters<typeof changeRecordedActionAudio>[0];
  const targets = [{ ref: { kind: 'signal' as const, id: 'same' }, family: 'typing' as const }];
  await changeRecordedActionAudio(state, targets, { presetId: 'typing-natural-v1' });
  expect(state.flushAdvanced).toHaveBeenCalledOnce();
  expect(state.setActionAudio).toHaveBeenCalledOnce();
  expect(vi.mocked(state.flushAdvanced).mock.invocationCallOrder[0]!).toBeLessThan(
    vi.mocked(state.setActionAudio).mock.invocationCallOrder[0]!
  );
  const update = vi.mocked(state.setActionAudio).mock.calls[0]![0];
  expect(update([])).toMatchObject([
    { ref: targets[0]!.ref, enabled: true, presetId: 'typing-natural-v1' },
  ]);
  expect(state.setMode).toHaveBeenCalledWith('advanced');
  expect(state.setActiveSelection).toHaveBeenCalledWith(state.activeSelection);
  vi.mocked(state.flushAdvanced).mockRejectedValueOnce(new Error('Save failed'));
  await changeRecordedActionAudio(state, targets, { volume: 0.1 });
  expect(state.setActionAudio).toHaveBeenCalledOnce();
  expect(state.setMessage).toHaveBeenCalledOnce();
  state.canStart = () => false;
  await changeRecordedActionAudio(state, targets, { enabled: true });
  expect(state.setActionAudio).toHaveBeenCalledOnce();
});
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
