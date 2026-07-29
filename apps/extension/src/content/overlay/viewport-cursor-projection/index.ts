import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createViewportCursorProjectionController } from './controller';
import type { ViewportCursorProjectionAuthority } from '@sniptale/runtime-contracts/video/types/messages.content';

const viewportCursorProjectionOwner = createLazyContentDefaultOwner(
  createViewportCursorProjectionController
);

export function enableViewportCursorProjection(
  authority: ViewportCursorProjectionAuthority
): boolean {
  return viewportCursorProjectionOwner.getOwner().enable(authority);
}

export function disableViewportCursorProjection(
  authority: ViewportCursorProjectionAuthority
): void {
  viewportCursorProjectionOwner.getOwnerIfCreated()?.disable(authority);
}

export function disposeViewportCursorProjection(): void {
  viewportCursorProjectionOwner.getOwnerIfCreated()?.dispose();
}

export { createViewportCursorProjectionController } from './controller';
