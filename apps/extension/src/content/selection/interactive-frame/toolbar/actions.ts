import type { EffectMode } from '../../../../features/highlighter/contracts';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { InteractiveFrameToolbarProps } from './types';
import {
  createSharedToolbarClickHandlers,
  dispatchCalloutEnable,
  dispatchStepBadgeEnable,
} from './dispatch';
import type { ToolbarClickEvent } from './dispatch';
import { getFrameAnnotationCommandSchema } from '../../../../features/highlighter/frame-annotation/commands';
import { appendFrameCallout } from '../../../../features/highlighter/frame-annotation/callout/collection';
import { createDefaultFrameCallout } from '../../../../features/highlighter/frame-annotation/defaults';

export function createEffectButtons() {
  return getFrameAnnotationCommandSchema()
    .filter((item) => item.id.startsWith('effect-'))
    .map((item) => ({ mode: item.id.slice('effect-'.length) as EffectMode, label: item.label }));
}

export function createToolbarSurfaceHandlers(props: InteractiveFrameToolbarProps) {
  return {
    onWrapperMouseDown: (event: React.MouseEvent) => {
      event.stopPropagation();
    },
    onWrapperClick: (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        props.closePopover();
      }
    },
    onToolbarMouseDown: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onToolbarClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.target === event.currentTarget) {
        props.closePopover();
      }
    },
  };
}

export function enableFrameStepBadge(
  props: Pick<InteractiveFrameToolbarProps, 'closePopover'> & {
    frameId: string;
  }
) {
  props.closePopover();
  dispatchStepBadgeEnable(props.frameId);
}

export function startFrameCalloutEditing(
  props: Pick<InteractiveFrameToolbarProps, 'closePopover' | 'setIsCalloutEditing' | 'setState'> & {
    clearSelection?: InteractiveFrameToolbarProps['clearSelection'];
    frameId: string;
  }
) {
  props.closePopover();
  pagePreparationHistory.beginTransaction(`callout-editing:${props.frameId}`);
  dispatchCalloutEnable(props.frameId);
  props.setState('idle');
  props.setIsCalloutEditing(true);
  props.clearSelection?.();
}

export function createInteractiveFrameToolbarActions(
  props: InteractiveFrameToolbarProps,
  captureVisibilityToggle?: () => void
) {
  return {
    ...createSharedToolbarClickHandlers(props, captureVisibilityToggle),
    handleStepBadgeClick: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const enabled = props.frame.stepBadge?.enabled ?? false;
      if (!enabled) {
        enableFrameStepBadge({ closePopover: props.closePopover, frameId: props.frame.id });
        return;
      }
      props.togglePopover(props.frame.id, 'step-badge');
    },
    handleCalloutClick: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      props.setActiveCalloutIndex?.(0);
      const hasCallout = props.frame.callout?.enabled ?? false;
      if (!hasCallout) {
        startFrameCalloutEditing({
          clearSelection: props.clearSelection,
          closePopover: props.closePopover,
          frameId: props.frame.id,
          setIsCalloutEditing: props.setIsCalloutEditing,
          setState: props.setState,
        });
        return;
      }
      props.togglePopover(props.frame.id, 'callout-settings', 0);
    },
    handleAddCalloutClick: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      if (!props.frame.callout?.enabled) return;
      let appended = appendFrameCallout(props.frame, createDefaultFrameCallout());
      let nextFrame: typeof props.frame;
      if (props.stageCalloutFrame) {
        appended = null;
        nextFrame = props.stageCalloutFrame((current) => {
          const latest = appendFrameCallout(current, createDefaultFrameCallout());
          if (!latest) return current;
          appended = latest;
          return latest.frame as typeof props.frame;
        });
      } else {
        if (!appended) return;
        nextFrame = appended.frame as typeof props.frame;
        props.setTempFrame?.(nextFrame);
      }
      if (!appended) return;
      props.closePopover();
      pagePreparationHistory.beginTransaction(`callout-editing:${props.frame.id}`);
      props.onUpdate(nextFrame);
      props.setActiveCalloutIndex?.(appended.calloutIndex);
      props.setState('idle');
      props.setIsCalloutEditing(true);
      props.clearSelection?.();
    },
  };
}
