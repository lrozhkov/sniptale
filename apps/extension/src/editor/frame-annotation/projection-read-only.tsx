import { FrameCalloutExportSurface } from '../../features/highlighter/frame-annotation/callout/export-surface';
import {
  getFrameCalloutKey,
  getFrameCallouts,
} from '../../features/highlighter/frame-annotation/callout/collection';
import { FrameStepBadgeInteractiveSurface } from '../../features/highlighter/frame-annotation/step-badge/interactive-surface';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';
import type { resolveFrameAnnotationVisualScene } from '../../features/highlighter/frame-annotation';
import type { FrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { getRepresentativeColor } from '@sniptale/foundation/paint';

/** Renders crop-mode frame content without editing controls. */
export function FrameProjectionReadOnlyOverlays(props: {
  coordinateSpace: FrameAnnotationCoordinateSpace;
  controlsRoot: HTMLDivElement | null;
  scene: ReturnType<typeof resolveFrameAnnotationVisualScene>;
  sceneRoot: HTMLDivElement | null;
  snapshot: FrameAnnotationSnapshotV1;
}) {
  if (!props.sceneRoot) return null;
  const badge = props.snapshot.stepBadge;
  return (
    <>
      {getFrameCallouts(props.snapshot).map((callout, index) =>
        callout.enabled ? (
          <FrameCalloutExportSurface
            callout={callout}
            calloutIndex={index}
            coordinateSpace={props.coordinateSpace}
            frame={props.snapshot}
            key={getFrameCalloutKey(props.snapshot, index)}
            portalTarget={props.sceneRoot!}
          />
        ) : null
      )}
      {badge?.enabled ? (
        <FrameStepBadgeInteractiveSurface
          borderColor={props.scene.borderColor}
          borderWidth={props.scene.borderWidth}
          chrome="export"
          controlsPortalTarget={props.controlsRoot ?? props.sceneRoot}
          frameRect={props.snapshot}
          portalTheme={null}
          settings={badge}
          showSettingsHandle={false}
          surfacePortalTarget={props.sceneRoot}
          {...(props.snapshot.borderSettings?.fillPaint
            ? { fillColor: getRepresentativeColor(props.snapshot.borderSettings.fillPaint) }
            : {})}
          {...(props.snapshot.borderSettings?.shadow === undefined
            ? {}
            : { shadow: props.snapshot.borderSettings.shadow })}
        />
      ) : null}
    </>
  );
}
