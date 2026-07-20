import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import { ArrowOverlayEditor, PointOverlayEditor } from './overlay-editor.point-arrow';
import { RectOverlayEditor, TextOverlayEditor } from './overlay-editor.text-rect';
export { getOverlayKindLabel } from './overlay-editor.helpers';

export function ScenarioQuickEditOverlayEditor(props: {
  overlay: ScenarioOverlay;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  if (props.overlay.kind === 'click-ring' || props.overlay.kind === 'cursor') {
    return <PointOverlayEditor overlay={props.overlay} onChange={props.onChange} />;
  }

  if (props.overlay.kind === 'arrow') {
    return <ArrowOverlayEditor overlay={props.overlay} onChange={props.onChange} />;
  }

  if (props.overlay.kind === 'text') {
    return <TextOverlayEditor overlay={props.overlay} onChange={props.onChange} />;
  }

  return <RectOverlayEditor overlay={props.overlay} onChange={props.onChange} />;
}
