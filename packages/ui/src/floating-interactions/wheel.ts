import { useCallback, useRef, type Ref, type RefCallback } from 'react';
import { containFloatingSurfaceWheel } from '../dom-events';

interface WheelSurfaceAttachment<T extends HTMLElement> {
  cleanup: () => void;
  node: T;
}

/**
 * Returns a committed-node ref that owns non-passive wheel attachment and optional ref forwarding.
 */
export function useFloatingSurfaceWheelContainment<T extends HTMLElement>(
  forwardedRef?: Ref<T>
): RefCallback<T> {
  const attachmentRef = useRef<WheelSurfaceAttachment<T> | null>(null);

  return useCallback(
    (node: T | null) => {
      const currentAttachment = attachmentRef.current;
      if (node && currentAttachment?.node === node) {
        return currentAttachment.cleanup;
      }
      currentAttachment?.cleanup();
      if (!node) {
        return undefined;
      }

      node.addEventListener('wheel', containFloatingSurfaceWheel, { passive: false });
      const forwardedCleanup = typeof forwardedRef === 'function' ? forwardedRef(node) : undefined;
      if (forwardedRef && typeof forwardedRef !== 'function') {
        forwardedRef.current = node;
      }
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        node.removeEventListener('wheel', containFloatingSurfaceWheel);
        if (typeof forwardedCleanup === 'function') {
          forwardedCleanup();
        } else if (typeof forwardedRef === 'function') {
          forwardedRef(null);
        } else if (forwardedRef?.current === node) {
          forwardedRef.current = null;
        }
        if (attachmentRef.current?.cleanup === cleanup) {
          attachmentRef.current = null;
        }
      };
      attachmentRef.current = { cleanup, node };
      return cleanup;
    },
    [forwardedRef]
  );
}
