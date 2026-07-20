import {
  addEventListenerToAllWindowsDynamic,
  resolveIframeEventTarget,
} from '../../../platform/frame';
import {
  buildScenarioTargetDescriptor,
  describeScenarioTarget,
  formatShortcutLabel,
  isScenarioEligibleInteractionTarget,
} from '../../scenario-recorder/runtime';
import { isTrustedDomEvent, isTrustedKeyboardEvent } from '../../../platform/trusted-events';
import { recordScenarioSuggestedEvent } from '../runtime/transport/capture';

function recordSuggestedEvent(args: {
  kind: 'change' | 'input' | 'keydown';
  message: string;
  target?: ReturnType<typeof buildScenarioTargetDescriptor>;
}) {
  void recordScenarioSuggestedEvent(args);
}

function buildTargetDescriptor(event: Event, iframe?: HTMLIFrameElement) {
  const target = resolveIframeEventTarget(event, iframe);
  if (!isScenarioEligibleInteractionTarget(target)) {
    return null;
  }

  return buildScenarioTargetDescriptor(target);
}

function createInputListener() {
  return addEventListenerToAllWindowsDynamic<InputEvent>(
    'input',
    (event, iframe) => {
      if (!isTrustedDomEvent(event)) {
        return;
      }

      const descriptor = buildTargetDescriptor(event, iframe);
      if (!descriptor) {
        return;
      }

      recordSuggestedEvent({
        kind: 'input',
        message: `Input: ${describeScenarioTarget(descriptor) || descriptor.tagName || 'field'}`,
        target: descriptor,
      });
    },
    { capture: true }
  );
}

function createChangeListener() {
  return addEventListenerToAllWindowsDynamic<Event>(
    'change',
    (event, iframe) => {
      if (!isTrustedDomEvent(event)) {
        return;
      }

      const descriptor = buildTargetDescriptor(event, iframe);
      if (!descriptor) {
        return;
      }

      recordSuggestedEvent({
        kind: 'change',
        message: `Change: ${describeScenarioTarget(descriptor) || 'field'}`,
        target: descriptor,
      });
    },
    { capture: true }
  );
}

function createKeydownListener(projectId: string | null) {
  return addEventListenerToAllWindowsDynamic<KeyboardEvent>(
    'keydown',
    (event) => {
      if (
        !projectId ||
        !isTrustedKeyboardEvent(event) ||
        (!event.ctrlKey && !event.metaKey && !event.altKey)
      ) {
        return;
      }

      recordSuggestedEvent({
        kind: 'keydown',
        message: `Shortcut: ${formatShortcutLabel(event)}`,
      });
    },
    { capture: true }
  );
}

export function registerScenarioSuggestedEventListeners(projectId: string | null) {
  const cleanupInput = createInputListener();
  const cleanupChange = createChangeListener();
  const cleanupKeyDown = createKeydownListener(projectId);

  return () => {
    cleanupInput();
    cleanupChange();
    cleanupKeyDown();
  };
}
