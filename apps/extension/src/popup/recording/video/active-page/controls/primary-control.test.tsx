import { describe, expect, it, vi } from 'vitest';

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  getVideoActivePauseResumeLabel: (isPaused: boolean) => `toggle:${isPaused}`,
}));

import { VideoActivePrimaryControl } from './primary-control';

describe('video active primary control', () => {
  it('exports the primary control component', () => {
    expect(VideoActivePrimaryControl).toBeTypeOf('function');
  });

  it('renders both pause and resume states', () => {
    const paused = VideoActivePrimaryControl({
      isPaused: true,
      onPauseResume: () => undefined,
    });
    const running = VideoActivePrimaryControl({
      isPaused: false,
      onPauseResume: () => undefined,
    });

    expect(paused.props.children[1]).toBe('toggle:true');
    expect(running.props.children[1]).toBe('toggle:false');
  });
});
