export function bindRegionSelectorRootEvents(props: {
  overlay: HTMLElement;
  region: HTMLElement;
  handleRegionCancelled: () => void;
  onDragStart: (event: MouseEvent | PointerEvent) => void;
  onResizeStart: (event: MouseEvent | PointerEvent, corner: string) => void;
}) {
  const handleOverlayPress = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const shouldCancel =
      target === props.overlay || Boolean(target?.closest('[data-ui="content.region-mask"]'));
    if (shouldCancel) {
      props.handleRegionCancelled();
    }
  };

  const handleRegionPress = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('sniptale-resize')) {
      props.onResizeStart(event, target.dataset['corner'] || '');
      return;
    }

    props.onDragStart(event);
  };

  props.overlay.addEventListener('pointerdown', handleOverlayPress);
  props.overlay.addEventListener('mousedown', handleOverlayPress);
  props.region.addEventListener('pointerdown', handleRegionPress);
  props.region.addEventListener('mousedown', handleRegionPress);
}
