import type { ImageEditorController } from '../../controller';

export function createEditorViewportPreviewPointerHandlers(args: {
  dragPointerIdRef: React.MutableRefObject<number | null>;
  navigateFromClientPoint: (clientX: number, clientY: number) => void;
}) {
  return {
    handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
      args.dragPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      args.navigateFromClientPoint(event.clientX, event.clientY);
    },

    handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
      if (args.dragPointerIdRef.current !== event.pointerId) {
        return;
      }

      args.navigateFromClientPoint(event.clientX, event.clientY);
    },

    handlePointerRelease(event: React.PointerEvent<HTMLDivElement>) {
      if (args.dragPointerIdRef.current !== event.pointerId) {
        return;
      }

      args.dragPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };
}

export function createEditorViewportPreviewKeyHandler(args: {
  controller: Pick<ImageEditorController, 'navigateViewportTo'>;
  viewportCenter: { x: number; y: number };
}) {
  return (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.14 : 0.06;

    switch (event.key) {
      case 'ArrowLeft':
        args.controller.navigateViewportTo(args.viewportCenter.x - step, args.viewportCenter.y);
        event.preventDefault();
        break;
      case 'ArrowRight':
        args.controller.navigateViewportTo(args.viewportCenter.x + step, args.viewportCenter.y);
        event.preventDefault();
        break;
      case 'ArrowUp':
        args.controller.navigateViewportTo(args.viewportCenter.x, args.viewportCenter.y - step);
        event.preventDefault();
        break;
      case 'ArrowDown':
        args.controller.navigateViewportTo(args.viewportCenter.x, args.viewportCenter.y + step);
        event.preventDefault();
        break;
      case 'Home':
        args.controller.navigateViewportTo(0.5, 0.5);
        event.preventDefault();
        break;
      default:
        break;
    }
  };
}
