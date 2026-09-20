// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewActionProperties } from './action-properties';
import { planReviewActionEdits } from '../../features/video/review/action-edits';

const marker = {
  ref: { kind: 'action' as const, id: 'click' },
  eventType: 'CLICK',
  start: 1,
  end: 1,
  target: '<button>Save</button>',
};
const plan = planReviewActionEdits({
  marker,
  duration: 6,
  edits: [],
  regions: [],
  boundaries: [0, 2, 4, 6],
  snapToKeyframes: false,
});

it('shows recorded target metadata as text and tolerates a disappearing selection', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
          plan={plan}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
          marker={{
            ref: { kind: 'action', id: 'click' },
            eventType: 'CLICK',
            start: 1,
            end: 1,
            target: '<button>Save</button>',
          }}
        />
      )
    );
    expect(host.textContent).toContain('<button>Save</button>');
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelectorAll('button:disabled')).toHaveLength(0);
    act(() =>
      root.render(
        <ReviewActionProperties
          marker={undefined}
          plan={null}
          busy={false}
          onEdit={vi.fn()}
          onFocus={vi.fn()}
        />
      )
    );
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
