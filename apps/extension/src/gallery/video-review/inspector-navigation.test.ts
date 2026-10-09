import { expect, it, vi } from 'vitest';
import { reviewTimelineInspectorCommands } from './inspector-navigation';

it('keeps text and document exclusive while preserving other inspector commands', () => {
  const pause = vi.fn();
  const select = vi.fn();
  const seek = vi.fn();
  const open = vi.fn();
  const remember = vi.fn();
  let exportRequest = 0;
  const commands = reviewTimelineInspectorCommands({
    video: { current: { pause } },
    select,
    seek,
    navigation: { shown: 'speech', setSection: open },
    selectedTextId: 'text',
    selectedSpeechId: 'speech',
    setSpeechId: remember,
    requestExport: (update) => {
      exportRequest = update(exportRequest);
    },
  });
  expect(commands.selectedSpeechId).toBe('speech');
  commands.onSelectText('text');
  expect(select).toHaveBeenLastCalledWith({ kind: 'text', id: 'text' });
  expect(open).toHaveBeenLastCalledWith('selected');
  commands.onOpenText();
  expect(select).toHaveBeenLastCalledWith({ kind: 'none' });
  expect(open).toHaveBeenLastCalledWith('text');
  commands.onOpenSpeech('take', 2);
  expect(remember).toHaveBeenLastCalledWith('take');
  expect(seek).toHaveBeenCalledWith(2, false);
  expect(open).toHaveBeenLastCalledWith('speech');
  seek.mockClear();
  commands.onOpenSpeech();
  expect(seek).not.toHaveBeenCalled();
  commands.onOpenHistory();
  expect(open).toHaveBeenLastCalledWith('history');
  commands.onOpenExport();
  expect(exportRequest).toBe(1);
  expect(pause).toHaveBeenCalledTimes(4);
});

it('allows document navigation while no video element is mounted', () => {
  const commands = reviewTimelineInspectorCommands({
    video: { current: null },
    select: vi.fn(),
    seek: vi.fn(),
    navigation: { shown: 'export', setSection: vi.fn() },
    selectedTextId: undefined,
    selectedSpeechId: 'take',
    setSpeechId: vi.fn(),
    requestExport: vi.fn(),
  });
  expect(commands.selectedSpeechId).toBeUndefined();
  expect(commands.exportActive).toBe(true);
  expect(() => commands.onOpenText()).not.toThrow();
  expect(() => commands.onSelectText('text')).not.toThrow();
});
