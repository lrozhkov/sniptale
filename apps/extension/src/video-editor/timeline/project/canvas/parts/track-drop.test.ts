import type React from 'react';
import { expect, it, vi } from 'vitest';
import { createTrackFileDropHandler } from './track-drop';

function createTimelineFileDropEvent() {
  const file = new File(['video'], 'clip.webm', { type: 'video/webm' });
  return {
    clientX: 320,
    clientY: 120,
    currentTarget: {
      getBoundingClientRect: () => ({ top: 80 }),
    },
    dataTransfer: {
      files: [file],
      getData: () => '',
      items: [{ kind: 'file', type: 'video/webm' }],
      types: ['Files'],
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.DragEvent<HTMLDivElement>;
}

it('routes timeline file drops with the resolved logical lane target', () => {
  const onDropTimelineFile = vi.fn();
  const event = createTimelineFileDropEvent();

  createTrackFileDropHandler({
    onDropTimelineFile,
    onSetDropTrackId: vi.fn(),
    onUnsupportedTimelineFileDrop: vi.fn(),
    resolveTimelineLaneId: () => 'line-2',
    trackId: 'track-a',
  })(event);

  expect(onDropTimelineFile).toHaveBeenCalledWith(
    expect.objectContaining({
      clientX: 320,
      targetTimelineLaneId: 'line-2',
      targetTrackId: 'track-a',
    })
  );
});
