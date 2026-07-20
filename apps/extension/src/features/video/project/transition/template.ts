import {
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionEasing,
  type VideoProjectTransition,
} from '../types/index';
import {
  getVideoTransitionTemplateDefinition,
  resolveVideoTransitionTemplateKind,
} from './template-registry';
import { resolveTransitionTemplateControls } from './template-controls';

function isVideoTemplateDirection(value: unknown): value is VideoTemplateDirection {
  return Object.values(VideoTemplateDirection).includes(value as VideoTemplateDirection);
}

function isVideoTemplateIntensity(value: unknown): value is VideoTemplateIntensity {
  return Object.values(VideoTemplateIntensity).includes(value as VideoTemplateIntensity);
}

function resolveVideoTransitionEasing(value: unknown): VideoTransitionEasing {
  return Object.values(VideoTransitionEasing).includes(value as VideoTransitionEasing)
    ? (value as VideoTransitionEasing)
    : VideoTransitionEasing.LINEAR;
}

export function normalizeVideoProjectTransition(
  transition: VideoProjectTransition
): VideoProjectTransition {
  const { highlightColor: _highlightColor, ...baseTransition } = transition;
  const templateKind = resolveVideoTransitionTemplateKind(
    transition.templateKind ?? transition.kind
  );
  const definition = getVideoTransitionTemplateDefinition(templateKind);
  const controls = resolveTransitionTemplateControls(definition);

  const normalizedTransition = {
    ...baseTransition,
    duration: Math.max(0, transition.duration),
    direction:
      controls.supportsDirection && isVideoTemplateDirection(transition.direction)
        ? transition.direction
        : definition.defaultDirection,
    easing: resolveVideoTransitionEasing(transition.easing),
    intensity: isVideoTemplateIntensity(transition.intensity)
      ? transition.intensity
      : definition.defaultIntensity,
    kind: definition.kind,
    renderKind: definition.renderKind,
    templateKind,
  } satisfies VideoProjectTransition;

  return controls.supportsHighlightColor
    ? {
        ...normalizedTransition,
        highlightColor:
          typeof transition.highlightColor === 'string'
            ? transition.highlightColor
            : definition.defaultHighlightColor,
      }
    : normalizedTransition;
}

export {
  getCompatibleVideoTransitionTemplateKinds,
  getVideoTransitionTemplateDefinition,
  getVideoTransitionTemplateGroups,
  getVideoTransitionTemplateSelectionOrder,
} from './template-registry';
