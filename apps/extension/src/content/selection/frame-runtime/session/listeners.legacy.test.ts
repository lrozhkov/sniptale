// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { registerLegacyGlobalStepBadgeSettingsListener } from './listeners';

describe('legacy global step-badge settings listener', () => {
  it('ignores malformed legacy custom event detail', () => {
    const listener = vi.fn();
    const cleanup = registerLegacyGlobalStepBadgeSettingsListener(listener);

    window.dispatchEvent(new Event('sniptale-global-step-badge-settings-changed'));
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: null,
      })
    );
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: null },
      })
    );
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: { autoMode: 'true' } },
      })
    );
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: { enabled: true } },
      })
    );
    window.dispatchEvent(
      new CustomEvent('sniptale-global-step-badge-settings-changed', {
        detail: { settings: { autoMode: true } },
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ autoMode: true });

    cleanup();
  });
});
