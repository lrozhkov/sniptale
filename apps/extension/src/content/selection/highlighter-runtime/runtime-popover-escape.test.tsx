// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { usePopoverEscapeClose } from '../../../composition/frame-annotation-controls/popover/hooks';
import { createHighlighterRuntimeEscapeKeyHandler } from './runtime-listeners';

function OpenPopoverEscapeOwner(props: { onClose: () => void }) {
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  usePopoverEscapeClose({
    anchorEl: anchorRef.current,
    isOpen: true,
    onClose: props.onClose,
  });
  return <button ref={anchorRef}>anchor</button>;
}

describe('highlighter runtime and popover Escape priority', () => {
  it('lets the later-mounted active popover close before disabling highlighter mode', () => {
    const disableHighlighterMode = vi.fn();
    const onClose = vi.fn();
    const runtimeHandler = createHighlighterRuntimeEscapeKeyHandler({
      disableHighlighterMode,
      hasActivePopover: () => true,
      isAnyFrameEditing: () => false,
    });
    window.addEventListener('keydown', runtimeHandler, { capture: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<OpenPopoverEscapeOwner onClose={onClose} />));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onClose).toHaveBeenCalledOnce();
    expect(disableHighlighterMode).not.toHaveBeenCalled();

    act(() => root.unmount());
    window.removeEventListener('keydown', runtimeHandler, { capture: true });
    container.remove();
  });
});
