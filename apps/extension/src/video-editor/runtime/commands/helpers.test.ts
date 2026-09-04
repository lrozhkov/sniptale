import { describe, expect, it } from 'vitest';
import { toErrorMessage } from './helpers';

describe('video editor action handler helpers', () => {
  it('normalizes error-like values into localized safe UI copy', () => {
    expect(toErrorMessage(new Error('boom'), 'videoEditor.app.exportStartFailed')).not.toContain(
      'boom'
    );
    expect(toErrorMessage('fallback', 'videoEditor.app.exportStartFailed')).not.toContain(
      'fallback'
    );
  });
});
