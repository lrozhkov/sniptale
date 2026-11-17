// @vitest-environment jsdom
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../features/video/review/advanced/defaults';
import { createReviewCommandFixture } from './editor-fixture.test-support';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewText } from './use-review-text';
import { createReviewTextDocument } from '../../features/video/review/text-document';

it('adds text at the live result clock inside a freeze without a root render', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let resultTime = 4;
  let text = createReviewTextDocument();
  let editor!: ReturnType<typeof useReviewText>;
  const edits = [
    {
      id: 'hold',
      kind: 'freeze' as const,
      start: 1,
      end: 1,
      requestedStart: 1,
      requestedEnd: 1,
      duration: 8,
      frameTime: 0.98,
      frameDuration: 0.04,
    },
  ];
  const commands = createReviewCommandFixture(() => ({
    duration: 12,
    time: 1,
    resultTime,
    advanced: { ...createQuickEditAdvancedState(), text },
    document: {
      annotations: [],
      canvasComments: [],
      edits,
      advancedContent: createQuickEditAdvancedContent(),
    },
  }));
  function Probe() {
    const input = {
      document: text,
      sourceDuration: 12,
      sourceTime: 1,
      resultTime,
      commands,
      edits,
      setText: (update: Parameters<Parameters<typeof useReviewText>[0]['setText']>[0]) => {
        text = update(text) ?? createReviewTextDocument();
      },
      select: vi.fn(),
      seek: vi.fn(),
      pause: vi.fn(),
    };
    editor = useReviewText(input);
    return null;
  }
  try {
    act(() => root.render(<Probe />));
    resultTime = 7;
    act(() => editor.add());
    expect(text.fragments[0]).toMatchObject({ start: 7, end: 10, timeDomain: 'result' });
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
