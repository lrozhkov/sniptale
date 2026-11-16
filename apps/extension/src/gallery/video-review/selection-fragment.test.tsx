// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineFragment } from './selection-fragment';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { reviewAdvancedContentBaseline } from '../../features/video/review/document';
import { createReviewTimeMap } from '../../features/video/review/timeline';

type Props = ComponentProps<typeof ReviewTimelineFragment>;
function fixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.zoom.regions = [
    {
      id: 'one',
      start: 2,
      end: 4,
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    },
    {
      id: 'two',
      start: 7,
      end: 9,
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    },
  ];
  const download = vi.fn();
  const pause = vi.fn();
  let allowed = true;
  const state = {
    activeSelection: { kind: 'none' },
    selection: { kind: 'point', time: 0 },
    playbackRange: null,
    snapshot: {
      document: {
        edits: [],
        annotations: [],
        canvasComments: [],
        advancedContent: reviewAdvancedContentBaseline(advanced),
      },
    },
    advanced,
    source: { duration: 12 },
    projected: { markers: [] },
    cursorFocusKeys: [],
    timeline: { timeMap: createReviewTimeMap(12, []) },
    editing: {
      exporter: {
        index: {
          duration: 12,
          boundaries: [0, 12],
          videoCodec: 'vp8',
          audioCodec: null,
          container: 'webm',
          rotation: 0,
        },
        checkingCodecs: false,
        phase: 'idle',
        downloadSelection: download,
      },
    },
    busy: false,
    composer: { before: null },
    beforeAction: (action: () => void) => {
      if (allowed) action();
    },
    pause,
  } as unknown as Props['state'];
  const props: Props = { state, keys: [], onSelectInterval: vi.fn(), onOpenExport: vi.fn() };
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = () => act(() => root.render(<ReviewTimelineFragment {...props} />));
  return {
    state,
    props,
    host,
    root,
    render,
    download,
    pause,
    setAllowed: (value: boolean) => {
      allowed = value;
    },
  };
}

it('keeps an icon-only disabled action without a range, and exports a range without an object', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const f = fixture();
  try {
    f.render();
    const button = f.host.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('');
    expect(button.title.length).toBeGreaterThan(0);
    expect(button.hasAttribute('data-review-toolbar-button')).toBe(false);
    f.state.playbackRange = { start: 1, end: 3, result: { start: 1, end: 3 } };
    f.state.activeSelection = { kind: 'zoom', id: 'two' };
    f.render();
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(f.download).toHaveBeenCalledExactlyOnceWith({ kind: 'range', ...f.state.playbackRange });
    expect(f.props.onSelectInterval).not.toHaveBeenCalled();
    expect(f.pause).toHaveBeenCalledOnce();
  } finally {
    act(() => f.root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([false, true])('selects item bounds before downloading, multiple=%s', (multiple) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const f = fixture();
  try {
    const order: string[] = [];
    f.state.activeSelection = { kind: 'zoom', id: 'one' };
    f.props.keys = multiple ? ['focus:one', 'focus:two'] : [];
    f.props.onSelectInterval = vi.fn(() => {
      order.push('interval');
    });
    f.download.mockImplementation(() => {
      order.push('download');
    });
    f.render();
    act(() => f.host.querySelector('button')!.click());
    const end = multiple ? 9 : 4;
    expect(f.props.onSelectInterval).toHaveBeenCalledExactlyOnceWith({
      start: 2,
      end,
      result: { start: 2, end },
    });
    expect(f.download).toHaveBeenCalledExactlyOnceWith({
      kind: 'range',
      start: 2,
      end,
      result: { start: 2, end },
    });
    expect(order).toEqual(['interval', 'download']);
  } finally {
    act(() => f.root.unmount());
    vi.unstubAllGlobals();
  }
});

it('prefers a source editing interval and preserves admission refusal and busy state', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const f = fixture();
  try {
    f.state.selection = { kind: 'range', start: 5, end: 6 };
    f.state.activeSelection = { kind: 'zoom', id: 'one' };
    f.setAllowed(false);
    f.render();
    act(() => f.host.querySelector('button')!.click());
    expect(f.download).not.toHaveBeenCalled();
    expect(f.props.onSelectInterval).not.toHaveBeenCalled();
    f.setAllowed(true);
    act(() => f.host.querySelector('button')!.click());
    expect(f.download).toHaveBeenCalledExactlyOnceWith(f.state.selection);
    f.state.busy = true;
    f.render();
    expect(f.host.querySelector('button')!.disabled).toBe(true);
  } finally {
    act(() => f.root.unmount());
    vi.unstubAllGlobals();
  }
});
