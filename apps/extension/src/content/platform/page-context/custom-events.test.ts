// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  addContentCustomDetailEventListener,
  dispatchContentCustomDetailEvent,
} from './custom-events';

function parseGuardedDetail(detail: unknown): { value: string } | null {
  const record =
    typeof detail === 'object' && detail !== null && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : null;
  return record && typeof record['value'] === 'string' ? { value: record['value'] } : null;
}

describe('content runtime custom events', () => {
  it('uses an extension-owned event target by default instead of page window', () => {
    const listener = vi.fn();
    const cleanup = addContentCustomDetailEventListener<{ value: string }>(
      'sniptale-test',
      listener
    );

    window.dispatchEvent(new CustomEvent('sniptale-test', { detail: { value: 'page' } }));
    dispatchContentCustomDetailEvent('sniptale-test', { value: 'extension' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 'extension' });

    cleanup();
  });

  it('ignores malformed and oversized detail before invoking the listener', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = addContentCustomDetailEventListener<{ value: string }>(
      'sniptale-guarded',
      listener,
      target,
      {
        maxSerializedDetailBytes: 32,
        parseDetail: parseGuardedDetail,
      }
    );

    target.dispatchEvent(new CustomEvent('sniptale-guarded', { detail: { value: 42 } }));
    target.dispatchEvent(
      new CustomEvent('sniptale-guarded', { detail: { value: 'x'.repeat(64) } })
    );
    target.dispatchEvent(new CustomEvent('sniptale-guarded', { detail: { value: 'ok' } }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 'ok' });

    cleanup();
  });
});
