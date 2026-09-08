import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AudioMuteToggle } from './audio-controls';

describe('workspace-sidebar/selection/audio-controls', () => {
  it('renders the mute toggle through the canonical shared toggle surface', () => {
    const markup = renderToStaticMarkup(
      <AudioMuteToggle checked disabled={false} label="Sound" onChange={vi.fn()} />
    );

    expect(markup).toContain('class="sniptale-glass-switch sniptale-glass-switch--on"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).toContain('Sound');
  });
});
