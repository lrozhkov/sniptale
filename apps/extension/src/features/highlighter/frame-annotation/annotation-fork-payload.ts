import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { AppliedBorderSettings, BlurSettings, EffectMode, FocusSettings } from '../contracts';
import {
  isCalloutSettings,
  isFocusSettings,
  isStepBadgeSettings,
  parseBlurSettings,
  parseBorderSettings,
} from './settings-parser';

type FrameForkDraft = {
  blurSettings: BlurSettings;
  borderSettings: AppliedBorderSettings;
  effectMode: EffectMode;
  focusSettings: FocusSettings;
};

export type AnnotationForkDrafts = {
  callout?: CalloutSettings;
  frame?: FrameForkDraft;
  stepBadge?: StepBadgeSettings;
};

type PersistedCalloutForkDraft = Omit<CalloutSettings, 'content' | 'instanceId' | 'style'> & {
  style: Omit<CalloutSettings['style'], 'badge'> & {
    badge: Omit<CalloutSettings['style']['badge'], 'text'>;
  };
};
type PersistedStepBadgeForkDraft = Omit<StepBadgeSettings, 'value'>;
type PersistedFrameForkDraft = Omit<FrameForkDraft, 'borderSettings'> & {
  borderSettings: Omit<AppliedBorderSettings, 'sourcePresetName'>;
};
type PersistedAnnotationForkDrafts = {
  callout?: PersistedCalloutForkDraft;
  frame?: PersistedFrameForkDraft;
  stepBadge?: PersistedStepBadgeForkDraft;
};

interface ExactShape {
  readonly [key: string]: true | ExactShape;
}

function leaf(...keys: string[]): ExactShape {
  return Object.fromEntries(keys.map((key) => [key, true] as const));
}
const pointShape = leaf('x', 'y');
const attachmentShape = leaf('anchorId', 'mode', 'perimeterPosition');
const paintShape: ExactShape = {
  ...leaf('kind', 'color'),
  gradient: {
    ...leaf('type', 'angle', 'startAngle', 'interpolation'),
    center: pointShape,
    radius: pointShape,
    repeat: leaf('enabled', 'span'),
    stops: true,
  },
};

const frameShape: ExactShape = {
  blurSettings: leaf(
    'amount',
    'blurType',
    'borderPresetId',
    'radius',
    'shadow',
    'showBorder',
    'strokeColor',
    'strokeOpacity',
    'strokeStyle',
    'strokeWidth'
  ),
  borderSettings: {
    ...leaf(
      'color',
      'customCss',
      'fillColor',
      'fillOpacity',
      'inheritCustomCss',
      'opacity',
      'radius',
      'shadow',
      'sourcePresetId',
      'strokeOpacity',
      'style',
      'width'
    ),
    fillPaint: paintShape,
    effects: {
      blur: leaf('amount', 'blurType'),
      capture: leaf('hideFrame'),
      focus: leaf('blurAmount', 'opacity'),
      linkedTemplates: leaf('calloutPresetId', 'stepBadgePresetId'),
    },
    padding: leaf('bottom', 'left', 'right', 'top'),
  },
  effectMode: true,
  focusSettings: leaf('blurAmount', 'opacity', 'showBorder'),
};

const calloutShape: ExactShape = {
  enabled: true,
  placement: {
    ...leaf(
      'anchor',
      'connectorBasePosition',
      'connectorBaseWidth',
      'connectorFramePosition',
      'side'
    ),
    connectorAttachments: { block: attachmentShape, frame: attachmentShape },
    connectorWaypoint: leaf('centerOffsetX', 'centerOffsetY'),
    manualPlacement: leaf('centerOffsetX', 'centerOffsetY'),
  },
  sourcePresetId: true,
  style: {
    accentEdge: leaf('color', 'enabled', 'lineStyle', 'side', 'width'),
    badge: leaf(
      'backgroundColor',
      'backgroundColorSource',
      'borderColor',
      'borderColorSource',
      'borderWidth',
      'enabled',
      'fontSize',
      'fontWeight',
      'placement',
      'shape',
      'size',
      'textColor',
      'textColorSource'
    ),
    colorBindings: leaf('accent', 'connector', 'shadow', 'surfaceBackground', 'surfaceBorder'),
    connector: {
      ...leaf(
        'blockMarker',
        'blockMarkerSize',
        'color',
        'frameMarker',
        'frameMarkerSize',
        'kind',
        'lineStyle',
        'routing',
        'wedgeSize',
        'width'
      ),
      cornerStyle: leaf('kind', 'radius'),
      curve: { curvature: true, endHandle: pointShape, mode: true, startHandle: pointShape },
      spacing: leaf('blockGap', 'frameGap', 'minimumEndSegment', 'obstacleMargin'),
    },
    customCss: true,
    surface: leaf(
      'backgroundColor',
      'borderColor',
      'borderStyle',
      'borderWidth',
      'paddingX',
      'paddingY',
      'radius',
      'shadow',
      'shadowColor',
      'textColor'
    ),
    title: leaf(
      'backgroundColor',
      'direction',
      'dividerColor',
      'dividerStyle',
      'dividerWidth',
      'enabled',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'textAlign',
      'textColor',
      'textDecoration'
    ),
    typography: leaf(
      'direction',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontWeight',
      'hyphens',
      'letterSpacing',
      'lineHeight',
      'maxWidth',
      'textAlign',
      'textDecoration',
      'wordBreak'
    ),
  },
};

const stepBadgeShape: ExactShape = {
  ...leaf(
    'alphabet',
    'anchor',
    'auto',
    'corner',
    'enabled',
    'offsetDirections',
    'size',
    'sizeLevel',
    'sourcePresetId',
    'type'
  ),
  manualPlacement: leaf('position', 'side'),
  style: leaf(
    'backgroundColor',
    'backgroundColorSource',
    'customCss',
    'diameter',
    'outlineColor',
    'outlineColorSource',
    'outlineWidth',
    'sizeSource',
    'textColor',
    'textColorSource'
  ),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactShape(value: unknown, shape: ExactShape): boolean {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(shape, key))
  ) {
    return false;
  }
  return Object.entries(shape).every(([key, nestedShape]) => {
    const nestedValue = value[key];
    return (
      nestedShape === true || nestedValue === undefined || hasExactShape(nestedValue, nestedShape)
    );
  });
}

function parseFrameForkDraft(value: unknown): FrameForkDraft | null {
  if (!hasExactShape(value, frameShape) || !isRecord(value)) return null;
  const borderSettings = parseBorderSettings(value['borderSettings']);
  const blurSettings = parseBlurSettings(value['blurSettings']);
  const focusSettings = value['focusSettings'];
  const effectMode = value['effectMode'];
  if (
    !borderSettings ||
    !blurSettings ||
    !isFocusSettings(focusSettings) ||
    !isRecord(focusSettings) ||
    (effectMode !== 'border' && effectMode !== 'blur' && effectMode !== 'focus')
  ) {
    return null;
  }
  return {
    blurSettings,
    borderSettings,
    effectMode,
    focusSettings: structuredClone(focusSettings) as unknown as FocusSettings,
  };
}

function parsePayloadRoot(payload: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (
      !isRecord(value) ||
      !hasExactShape(value, {
        drafts: { callout: true, frame: true, stepBadge: true },
        version: true,
      })
    ) {
      return null;
    }
    return value['version'] === 1 && isRecord(value['drafts']) ? value['drafts'] : null;
  } catch {
    return null;
  }
}

export function parseAnnotationForkDraftPayload(payload: string): AnnotationForkDrafts | null {
  const drafts = parsePayloadRoot(payload);
  if (!drafts) return null;
  const frame = drafts['frame'] === undefined ? undefined : parseFrameForkDraft(drafts['frame']);
  const callout = drafts['callout'];
  const stepBadge = drafts['stepBadge'];
  if (
    frame === null ||
    (callout !== undefined && (!hasExactShape(callout, calloutShape) || !isRecord(callout))) ||
    (stepBadge !== undefined && (!hasExactShape(stepBadge, stepBadgeShape) || !isRecord(stepBadge)))
  ) {
    return null;
  }
  const calloutForValidation = isRecord(callout)
    ? {
        ...callout,
        content: { bodyHtml: '', titleText: '' },
        style: isRecord(callout['style'])
          ? {
              ...callout['style'],
              badge: isRecord(callout['style']['badge'])
                ? { ...callout['style']['badge'], text: '' }
                : callout['style']['badge'],
            }
          : callout['style'],
      }
    : undefined;
  const stepBadgeForValidation = isRecord(stepBadge) ? { ...stepBadge, value: '' } : undefined;
  if (
    (calloutForValidation && !isCalloutSettings(calloutForValidation)) ||
    (stepBadgeForValidation && !isStepBadgeSettings(stepBadgeForValidation))
  ) {
    return null;
  }
  return {
    ...(frame ? { frame } : {}),
    ...(calloutForValidation
      ? { callout: structuredClone(calloutForValidation) as unknown as CalloutSettings }
      : {}),
    ...(stepBadgeForValidation
      ? { stepBadge: structuredClone(stepBadgeForValidation) as unknown as StepBadgeSettings }
      : {}),
  };
}

function createPersistedDrafts(drafts: AnnotationForkDrafts): PersistedAnnotationForkDrafts {
  return {
    ...(drafts.frame
      ? {
          frame: {
            ...structuredClone(drafts.frame),
            borderSettings: (({ sourcePresetName: _sourcePresetName, ...borderSettings }) =>
              borderSettings)(drafts.frame.borderSettings),
          },
        }
      : {}),
    ...(drafts.callout
      ? {
          callout: {
            enabled: drafts.callout.enabled,
            placement: structuredClone(drafts.callout.placement),
            ...(drafts.callout.sourcePresetId === undefined
              ? {}
              : { sourcePresetId: drafts.callout.sourcePresetId }),
            style: {
              ...structuredClone(drafts.callout.style),
              badge: (({ text: _text, ...badge }) => badge)(drafts.callout.style.badge),
            },
          },
        }
      : {}),
    ...(drafts.stepBadge
      ? {
          stepBadge: (({ value: _value, ...stepBadge }) => structuredClone(stepBadge))(
            drafts.stepBadge
          ),
        }
      : {}),
  };
}

export function serializeAnnotationForkDraftPayload(drafts: AnnotationForkDrafts): string {
  return JSON.stringify({ drafts: createPersistedDrafts(drafts), version: 1 });
}

export function canonicalizeAnnotationForkDraftPayload(payload: string): string | null {
  const drafts = parseAnnotationForkDraftPayload(payload);
  return drafts ? serializeAnnotationForkDraftPayload(drafts) : null;
}
