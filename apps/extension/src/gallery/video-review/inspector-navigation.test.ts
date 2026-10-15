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

it('projects one exclusive object identity and keeps annotation selection behavior', () => {
  const select = vi.fn();
  const args = {
    video: { current: null },
    select,
    navigation: { shown: 'selected' as const, setSection: vi.fn() },
    selectedTextId: undefined,
    requestExport: vi.fn(),
  };
  const annotation = reviewTimelineInspectorCommands({
    ...args,
    selection: { kind: 'annotation-effect', id: 'annotation' },
  });
  expect(annotation.selectedAnnotationEffectId).toBe('annotation');
  expect(annotation.selectedCursorFocusId).toBeUndefined();
  annotation.onSelectAnnotationEffect('next');
  expect(select).toHaveBeenCalledExactlyOnceWith({ kind: 'annotation-effect', id: 'next' });
  const point = reviewTimelineInspectorCommands({
    ...args,
    selection: { kind: 'cursor-focus', id: 'point', time: 1 },
  });
  expect(point.selectedCursorFocusId).toBe('point');
  expect(point.selectedAnnotationEffectId).toBeNull();
  const event = reviewTimelineInspectorCommands({
    ...args,
    selection: { kind: 'telemetry', ref: { kind: 'action', id: 'event' } },
  });
  expect(event.selectedTelemetryRef).toEqual({ kind: 'action', id: 'event' });
  expect(event.selectedCursorFocusId).toBeUndefined();
});
