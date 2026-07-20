import { describe, expect, it } from 'vitest';

import { createEditorControllerBrowserFrameTokenMutators } from './tokens';

describe('editor controller public api token mutators', () => {
  it('creates and checks browser frame render tokens against controller state', () => {
    const controller = { browserFrameRenderToken: 4 };
    const tokens = createEditorControllerBrowserFrameTokenMutators(controller as never);

    expect(tokens.createBrowserFrameRenderToken()).toBe(5);
    expect(tokens.isBrowserFrameRenderTokenCurrent(5)).toBe(true);
    expect(tokens.isBrowserFrameRenderTokenCurrent(4)).toBe(false);
  });
});
