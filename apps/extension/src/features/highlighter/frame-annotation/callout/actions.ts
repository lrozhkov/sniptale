import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameCalloutInteractiveSurfaceProps } from './interactive-surface';

export function createFrameCalloutActions(args: {
  apply: (callout: CalloutSettings) => void;
  previewContent?: (callout: CalloutSettings) => void;
  callout: CalloutSettings;
  onDelete: () => void;
  onSettingsClick: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
}): Pick<
  FrameCalloutInteractiveSurfaceProps,
  | 'onCurveChange'
  | 'onPositionChange'
  | 'onSettingsClick'
  | 'onTailBaseRangeChange'
  | 'onTailFramePositionChange'
  | 'onTitleChange'
  | 'onWaypointChange'
  | 'onWidthChange'
> & {
  onContentChange: (bodyHtml: string) => void;
  onDelete: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
} {
  const { apply, callout } = args;
  const previewContent = args.previewContent ?? apply;
  return {
    onStartEditing: args.onStartEditing,
    onStopEditing: args.onStopEditing,
    onContentChange: (bodyHtml) =>
      previewContent({ ...callout, content: { ...callout.content, bodyHtml } }),
    onTitleChange: (titleText) =>
      previewContent({ ...callout, content: { ...callout.content, titleText } }),
    onDelete: args.onDelete,
    onSettingsClick: args.onSettingsClick,
    onPositionChange: (manualPlacement, behavior) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          manualPlacement,
          connectorBasePosition: behavior.connectorBasePosition,
          connectorBaseWidth: behavior.connectorBaseWidth,
          connectorFramePosition: behavior.connectorFramePosition,
          connectorWaypoint: behavior.connectorWaypoint,
          ...(behavior.translateConnectorGeometry
            ? {
                connectorAttachments: {
                  block:
                    behavior.connectorBasePosition === undefined
                      ? (callout.placement.connectorAttachments?.block ?? { mode: 'auto' })
                      : { mode: 'free', perimeterPosition: behavior.connectorBasePosition },
                  frame:
                    behavior.connectorFramePosition === undefined
                      ? (callout.placement.connectorAttachments?.frame ?? { mode: 'auto' })
                      : { mode: 'free', perimeterPosition: behavior.connectorFramePosition },
                },
              }
            : {}),
        },
      }),
    onTailBaseRangeChange: (connectorBasePosition, connectorBaseWidth, attachment) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          connectorAttachments: {
            block: attachment ?? { mode: 'free', perimeterPosition: connectorBasePosition },
            frame: callout.placement.connectorAttachments?.frame ?? { mode: 'auto' },
          },
          connectorBasePosition,
          connectorBaseWidth,
        },
      }),
    onTailFramePositionChange: (connectorFramePosition, attachment) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          connectorAttachments: {
            block: callout.placement.connectorAttachments?.block ?? { mode: 'auto' },
            frame: attachment ?? { mode: 'free', perimeterPosition: connectorFramePosition },
          },
          connectorFramePosition,
        },
      }),
    onWaypointChange: (connectorWaypoint) =>
      apply({ ...callout, placement: { ...callout.placement, connectorWaypoint } }),
    onCurveChange: (curve) =>
      apply({
        ...callout,
        style: {
          ...callout.style,
          connector: { ...callout.style.connector, curve },
        },
      }),
    onWidthChange: (maxWidth, manualPlacement) =>
      apply({
        ...callout,
        placement: { ...callout.placement, manualPlacement },
        style: {
          ...callout.style,
          typography: { ...callout.style.typography, maxWidth },
        },
      }),
  };
}
