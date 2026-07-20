import { describe, expect, it, vi } from 'vitest';

import { buildCropCompactCommands } from './crop';
import { createInspectorCommandParams } from '../../../../../../../../tooling/test/harness/editor/ownership/fixtures';

describe('buildCropCompactCommands', () => {
  it('builds crop commands and forwards applyCropSelection', async () => {
    const params = createInspectorCommandParams();
    const controller = {
      applyCropSelection: vi.fn(async () => undefined),
    };

    const commands = buildCropCompactCommands(params as never, controller);

    expect(commands).toHaveLength(2);
    await commands[1]?.onClick?.();
    expect(controller.applyCropSelection).toHaveBeenCalledOnce();
  });
});
