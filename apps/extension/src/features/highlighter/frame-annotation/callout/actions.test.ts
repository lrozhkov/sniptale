import { describe, expect, it, vi } from 'vitest';
import { createDefaultFrameCallout } from '../defaults';
import { createFrameCalloutActions } from './actions';

describe('createFrameCalloutActions', () => {
  it('applies title visibility immediately without changing the remaining style', () => {
    const callout = createDefaultFrameCallout();
    callout.style.title.enabled = false;
    const apply = vi.fn();
    const noop = vi.fn();
    const actions = createFrameCalloutActions({
      apply,
      callout,
      onDelete: noop,
      onSettingsClick: noop,
      onStartEditing: noop,
      onStopEditing: noop,
    });

    actions.onTitleEnabledChange(true);

    expect(apply).toHaveBeenCalledWith({
      ...callout,
      style: { ...callout.style, title: { ...callout.style.title, enabled: true } },
    });
  });

  it('routes the complete interaction contract through immutable callout updates', () => {
    const callout = createDefaultFrameCallout();
    const apply = vi.fn();
    const preview = vi.fn();
    const onDelete = vi.fn();
    const onSettingsClick = vi.fn();
    const onStartEditing = vi.fn();
    const onStopEditing = vi.fn();
    const actions = createFrameCalloutActions({
      apply,
      callout,
      previewContent: preview,
      onDelete,
      onSettingsClick,
      onStartEditing,
      onStopEditing,
    });

    actions.onStartEditing();
    actions.onStopEditing();
    actions.onDelete();
    actions.onSettingsClick();
    actions.onContentChange('<p>Changed</p>');
    actions.onBadgeTextChange('Label');
    actions.onTitleChange('Heading');
    actions.onPositionChange(
      { centerOffsetX: 12, centerOffsetY: 18 },
      {
        connectorBasePosition: 0.25,
        connectorBaseWidth: 0.2,
        connectorFramePosition: 0.75,
        connectorWaypoint: { centerOffsetX: 4, centerOffsetY: 6 },
        translateConnectorGeometry: true,
      }
    );
    actions.onPositionChange(
      { centerOffsetX: 2, centerOffsetY: 3 },
      { translateConnectorGeometry: false }
    );
    actions.onPositionChange(
      { centerOffsetX: 3, centerOffsetY: 4 },
      { translateConnectorGeometry: true }
    );
    actions.onTailBaseRangeChange(0.4, 0.15);
    actions.onTailBaseRangeChange(0.45, 0.1, {
      anchorId: 'bottom-center',
      mode: 'anchor',
      perimeterPosition: 0.45,
    });
    actions.onTailFramePositionChange(0.6);
    actions.onTailFramePositionChange(0.65, {
      anchorId: 'top-center',
      mode: 'anchor',
      perimeterPosition: 0.65,
    });
    actions.onWaypointChange({ centerOffsetX: 8, centerOffsetY: 9 });
    actions.onCurveChange({ curvature: 0.5, mode: 'auto' });
    actions.onWidthChange(280, { centerOffsetX: 10, centerOffsetY: 20 });

    expect(onStartEditing).toHaveBeenCalledOnce();
    expect(onStopEditing).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSettingsClick).toHaveBeenCalledOnce();
    expect(preview).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenCalledTimes(10);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: expect.objectContaining({
          connectorBasePosition: 0.4,
          connectorBaseWidth: 0.15,
        }),
      })
    );

    const fallbackApply = vi.fn();
    const fallbackActions = createFrameCalloutActions({
      apply: fallbackApply,
      callout: {
        ...callout,
        placement: { ...callout.placement, connectorAttachments: undefined },
      },
      onDelete,
      onSettingsClick,
      onStartEditing,
      onStopEditing,
    });
    fallbackActions.onContentChange('<p>Preview through apply</p>');
    fallbackActions.onTailBaseRangeChange(0.2, 0.1);
    fallbackActions.onTailFramePositionChange(0.8);
    expect(fallbackApply).toHaveBeenCalledTimes(3);
  });
});
