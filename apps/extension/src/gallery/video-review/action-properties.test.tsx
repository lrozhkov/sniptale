// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewActionProperties } from './action-properties';

it('shows recorded target metadata as text and tolerates a disappearing selection', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewActionProperties
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
    expect(host.querySelector('button')).toBeNull();
    act(() => root.render(<ReviewActionProperties marker={undefined} />));
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
