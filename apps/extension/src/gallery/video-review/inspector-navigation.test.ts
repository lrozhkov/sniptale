import { expect, it, vi } from 'vitest';
import { reviewTimelineInspectorCommands } from './inspector-navigation';

it('keeps text and document exclusive while preserving other inspector commands', () => {
  const pause = vi.fn();
  const select = vi.fn();
  const open = vi.fn();
  let exportRequest = 0;
  const commands = reviewTimelineInspectorCommands({
    video: { current: { pause } },
    select,
    navigation: { shown: 'speech', setSection: open },
    selectedTextId: 'text',
    requestExport: (update) => {
      exportRequest = update(exportRequest);
    },
  });
  commands.onSelectText('text');
  expect(select).toHaveBeenLastCalledWith({ kind: 'text', id: 'text' });
  expect(open).toHaveBeenLastCalledWith('selected');
  commands.onOpenText();
  expect(select).toHaveBeenLastCalledWith({ kind: 'none' });
  expect(open).toHaveBeenLastCalledWith('text');
  commands.onOpenSpeech();
  expect(open).toHaveBeenLastCalledWith('speech');
  commands.onOpenHistory();
  expect(open).toHaveBeenLastCalledWith('history');
  commands.onOpenExport();
  expect(exportRequest).toBe(1);
  expect(pause).toHaveBeenCalledTimes(3);
});

it('allows document navigation while no video element is mounted', () => {
  const commands = reviewTimelineInspectorCommands({
    video: { current: null },
    select: vi.fn(),
    navigation: { shown: 'export', setSection: vi.fn() },
    selectedTextId: undefined,
    requestExport: vi.fn(),
  });
  expect(commands.exportActive).toBe(true);
  expect(() => commands.onOpenText()).not.toThrow();
  expect(() => commands.onSelectText('text')).not.toThrow();
});
