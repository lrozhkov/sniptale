import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTextbox: vi.fn(() => false),
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isTextbox: mocks.isTextbox,
}));

import { isResizableTextCallout } from './runtime.text-callout-target';

describe('runtime text-callout target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextbox.mockReturnValue(false);
  });

  it('narrows only editor text and meta-stamp textbox targets', () => {
    mocks.isTextbox.mockReturnValue(true);

    expect(isResizableTextCallout({ sniptaleType: 'text' } as never)).toBe(true);
    expect(isResizableTextCallout({ sniptaleType: 'meta-stamp' } as never)).toBe(true);
    expect(isResizableTextCallout({ sniptaleType: 'rich-shape' } as never)).toBe(false);
  });

  it('rejects non-textbox objects', () => {
    expect(isResizableTextCallout({ sniptaleType: 'text' } as never)).toBe(false);
  });
});
