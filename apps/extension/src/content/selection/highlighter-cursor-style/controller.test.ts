import { expect, it, vi } from 'vitest';
import { createHighlighterCursorStyleController } from './controller';

it('replaces the previous cursor-style cleanup on repeated mounts and clears it on remove', () => {
  const firstCleanup = vi.fn();
  const secondCleanup = vi.fn();
  const mountStyle = vi.fn().mockReturnValueOnce(firstCleanup).mockReturnValueOnce(secondCleanup);
  const controller = createHighlighterCursorStyleController({ mountStyle });

  controller.mount();
  controller.mount();

  expect(firstCleanup).toHaveBeenCalledTimes(1);
  expect(mountStyle).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      styleId: 'sniptale-highlighter-cursor-style',
      textContent: expect.stringContaining('.sniptale-interactive-frame'),
    })
  );

  controller.remove();

  expect(secondCleanup).toHaveBeenCalledTimes(1);
});

it('disposes safely when the controller never mounted any style', () => {
  const mountStyle = vi.fn();
  const controller = createHighlighterCursorStyleController({ mountStyle });

  controller.dispose();

  expect(mountStyle).not.toHaveBeenCalled();
});
