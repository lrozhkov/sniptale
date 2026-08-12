function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeFrameCss(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 20_000) return false;
  const validation = validateCssPolicyString(value);
  return (
    !validation.rawError &&
    validation.blockedProps.length === 0 &&
    validation.properties.every((property) => !isReservedFrameCssProperty(property))
  );
}

function isOneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}

function isOptionalOneOf(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || isOneOf(value, allowed);
}

function isOptionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function isNullableString(value: unknown, maxLength: number): boolean {
  return value === null || (typeof value === 'string' && value.length <= maxLength);
}

function isLinkedTemplates(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableString(value['calloutPresetId'], 256) &&
    isNullableString(value['stepBadgePresetId'], 256)
  );
}

function isOptionalFinite(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

const SAFE_COLOR_PATTERN =
  /^(?:transparent|#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-/\s]+\))$/iu;

function isSafeCssColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !containsUnsafeCssSyntax(value) &&
    SAFE_COLOR_PATTERN.test(value)
  );
}

function hasSafeColorFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isSafeCssColor(value[field]));
}

function isBorderSettings(value: Record<string, unknown>): boolean {
  const padding = value['padding'];
  const effects = value['effects'];
  return (
    ['width', 'radius', 'shadow'].every((key) => isFiniteNumber(value[key])) &&
    ['opacity', 'strokeOpacity', 'fillOpacity'].every((key) => isOptionalFinite(value[key])) &&
    hasSafeColorFields(value, ['color']) &&
    (value['fillPaint'] === undefined || parsePaint(value['fillPaint']) !== null) &&
    (value['fillColor'] === undefined || isSafeCssColor(value['fillColor'])) &&
    isOneOf(value['style'], ['solid', 'dashed', 'dotted']) &&
    isRecord(padding) &&
    ['top', 'right', 'bottom', 'left'].every((key) => isFiniteNumber(padding[key])) &&
    isSafeFrameCss(value['customCss']) &&
    typeof value['inheritCustomCss'] === 'boolean' &&
    (effects === undefined ||
      (isRecord(effects) &&
        isRecord(effects['blur']) &&
        isRecord(effects['focus']) &&
        (effects['capture'] === undefined ||
          (isRecord(effects['capture']) &&
            (effects['capture']['hideFrame'] === undefined ||
              typeof effects['capture']['hideFrame'] === 'boolean'))) &&
        (effects['linkedTemplates'] === undefined ||
          isLinkedTemplates(effects['linkedTemplates'])) &&
        isFiniteNumber(effects['blur']['amount']) &&
        isOneOf(effects['blur']['blurType'], ['gaussian', 'distortion', 'pixelate', 'solid']) &&
        isFiniteNumber(effects['focus']['opacity']) &&
        isOptionalFinite(effects['focus']['blurAmount']))) &&
    isOptionalString(value['sourcePresetId'], 256) &&
    isOptionalString(value['sourcePresetName'], 1_000)
  );
}

export function parseBorderSettings(value: unknown): AppliedBorderSettings | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isBorderSettings(value)) return null;
  const color = normalizeColor(value['color'] as string);
  const fillColor = normalizeColor(
    typeof value['fillColor'] === 'string' ? value['fillColor'] : '#00000000'
  );
  if (!color || !fillColor) return null;
  const strokeMultiplier = isFiniteNumber(value['strokeOpacity'])
    ? value['strokeOpacity'] / 100
    : isFiniteNumber(value['opacity'])
      ? value['opacity'] <= 1
        ? value['opacity']
        : value['opacity'] / 100
      : 1;
  const canonicalColor = multiplyColorAlpha(color, strokeMultiplier);
  const canonicalFillColor = isFiniteNumber(value['fillOpacity'])
    ? multiplyColorAlpha(fillColor, value['fillOpacity'] / 100)
    : fillColor;
  if (!canonicalColor || !canonicalFillColor) return null;
  const parsedFillPaint = parsePaint(value['fillPaint']);
  if (value['fillPaint'] !== undefined && !parsedFillPaint) return null;
  return {
    width: value['width'] as number,
    color: canonicalColor,
    style: value['style'] as AppliedBorderSettings['style'],
    radius: value['radius'] as number,
    padding: { ...(value['padding'] as AppliedBorderSettings['padding']) },
    shadow: value['shadow'] as number,
    fillPaint: parsedFillPaint ?? createSolidPaint(canonicalFillColor),
    inheritCustomCss: value['inheritCustomCss'] as boolean,
    customCss: value['customCss'] as string,
    ...(isRecord(value['effects'])
      ? { effects: value['effects'] as unknown as NonNullable<AppliedBorderSettings['effects']> }
      : {}),
    ...(typeof value['sourcePresetId'] === 'string'
      ? { sourcePresetId: value['sourcePresetId'] }
      : {}),
    ...(typeof value['sourcePresetName'] === 'string'
      ? { sourcePresetName: value['sourcePresetName'] }
      : {}),
  };
}

function isBlurSettings(value: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(value['amount']) &&
    isOneOf(value['blurType'], ['gaussian', 'pixelate', 'distortion', 'solid']) &&
    (value['showBorder'] === undefined || typeof value['showBorder'] === 'boolean') &&
    isOptionalFinite(value['radius']) &&
    isOptionalFinite(value['shadow']) &&
    isOptionalFinite(value['strokeOpacity']) &&
    isOptionalFinite(value['strokeWidth']) &&
    (value['strokeColor'] === undefined || isSafeCssColor(value['strokeColor'])) &&
    (value['borderPresetId'] === undefined ||
      value['borderPresetId'] === null ||
      isOptionalString(value['borderPresetId'], 256)) &&
    isOptionalOneOf(value['strokeStyle'], [
      'solid',
      'dashed',
      'dotted',
      'dash',
      'dot',
      'dash-dot',
      'long-dash',
    ])
  );
}

export function parseBlurSettings(value: unknown): BlurSettings | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isBlurSettings(value)) return null;
  const strokeColor = isSafeCssColor(value['strokeColor'])
    ? normalizeColor(value['strokeColor'])
    : null;
  const canonicalStrokeColor =
    strokeColor && isFiniteNumber(value['strokeOpacity'])
      ? multiplyColorAlpha(strokeColor, value['strokeOpacity'])
      : strokeColor;
  return {
    amount: value['amount'] as number,
    blurType: value['blurType'] as BlurSettings['blurType'],
    ...(value['borderPresetId'] === undefined
      ? {}
      : { borderPresetId: value['borderPresetId'] as string | null }),
    ...(isFiniteNumber(value['radius']) ? { radius: value['radius'] } : {}),
    ...(isFiniteNumber(value['shadow']) ? { shadow: value['shadow'] } : {}),
    ...(typeof value['showBorder'] === 'boolean' ? { showBorder: value['showBorder'] } : {}),
    ...(canonicalStrokeColor ? { strokeColor: canonicalStrokeColor } : {}),
    ...(isOneOf(value['strokeStyle'], [
      'solid',
      'dashed',
      'dotted',
      'dash',
      'dot',
      'dash-dot',
      'long-dash',
    ])
      ? { strokeStyle: value['strokeStyle'] as NonNullable<BlurSettings['strokeStyle']> }
      : {}),
    ...(isFiniteNumber(value['strokeWidth']) ? { strokeWidth: value['strokeWidth'] } : {}),
  };
}

export function isFocusSettings(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value['opacity']) &&
    value['opacity'] >= 0 &&
    value['opacity'] <= 1 &&
    (value['blurAmount'] === undefined ||
      (isFiniteNumber(value['blurAmount']) &&
        value['blurAmount'] >= 0 &&
        value['blurAmount'] <= 25)) &&
    (value['showBorder'] === undefined || typeof value['showBorder'] === 'boolean')
  );
}

const FRAME_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

function isOptionalStringArray(value: unknown, allowed: readonly string[]): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= allowed.length &&
      value.every((entry) => isOneOf(entry, allowed)))
  );
}

function isOptionalStepBadgePlacement(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      isOneOf(value['side'], ['top', 'right', 'bottom', 'left']) &&
      isFiniteNumber(value['position']) &&
      value['position'] >= 0 &&
      value['position'] <= 1)
  );
}

function isStepBadgeStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value['sizeSource'], ['frame-border', 'custom']) &&
    isFiniteNumber(value['diameter']) &&
    value['diameter'] > 0 &&
    value['diameter'] <= 1_000 &&
    isOneOf(value['backgroundColorSource'], ['custom', 'frame-border', 'frame-fill']) &&
    isSafeCssColor(value['backgroundColor']) &&
    isOneOf(value['textColorSource'], ['custom', 'frame-border', 'frame-fill']) &&
    isSafeCssColor(value['textColor']) &&
    isOneOf(value['outlineColorSource'], ['custom', 'frame-border', 'frame-fill', 'surface']) &&
    isSafeCssColor(value['outlineColor']) &&
    (value['outlineWidth'] === undefined ||
      (isFiniteNumber(value['outlineWidth']) &&
        value['outlineWidth'] >= 0 &&
        value['outlineWidth'] <= 20)) &&
    (value['customCss'] === undefined ||
      (typeof value['customCss'] === 'string' &&
        validateStepBadgeCustomCss(value['customCss']).error === null))
  );
}

export function isStepBadgeSettings(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const style = value['style'];
  return (
    typeof value['enabled'] === 'boolean' &&
    typeof value['value'] === 'string' &&
    value['value'].length <= 1_000 &&
    isOneOf(value['type'], ['number', 'letter', 'manual']) &&
    isOptionalOneOf(value['alphabet'], ['cyrillic', 'latin']) &&
    isOptionalOneOf(value['anchor'], FRAME_ANCHORS) &&
    isOptionalOneOf(value['corner'], ['top-left', 'top-right', 'bottom-left', 'bottom-right']) &&
    isOptionalOneOf(value['size'], ['standard', 'large', 'extra-large']) &&
    (value['sizeLevel'] === undefined ||
      (Number.isInteger(value['sizeLevel']) &&
        Number(value['sizeLevel']) >= 0 &&
        Number(value['sizeLevel']) <= 20)) &&
    (value['auto'] === undefined || typeof value['auto'] === 'boolean') &&
    isOptionalString(value['sourcePresetId'], 256) &&
    isOptionalStringArray(value['offsetDirections'], ['up', 'down', 'left', 'right']) &&
    isOptionalStepBadgePlacement(value['manualPlacement']) &&
    (style === undefined || isStepBadgeStyle(style))
  );
}

function hasFields(
  value: unknown,
  numbers: readonly string[],
  strings: readonly string[] = [],
  booleans: readonly string[] = []
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    numbers.every((key) => isFiniteNumber(value[key])) &&
    strings.every((key) => typeof value[key] === 'string') &&
    booleans.every((key) => typeof value[key] === 'boolean')
  );
}

function isOptionalPoint(value: unknown, keys: readonly string[]): boolean {
  return value === undefined || hasFields(value, keys);
}

function isOptionalCalloutAttachments(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ['frame', 'block'].every((key) => {
    const attachment = value[key];
    return (
      isRecord(attachment) &&
      isOneOf(attachment['mode'], ['auto', 'anchor', 'free']) &&
      isOptionalString(attachment['anchorId'], 256) &&
      isOptionalFinite(attachment['perimeterPosition'])
    );
  });
}

function isCalloutSurface(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['borderWidth', 'paddingX', 'paddingY', 'radius', 'shadow'],
      ['borderColor', 'borderStyle', 'shadowColor', 'textColor']
    ) &&
    hasSafeColorFields(value, ['borderColor', 'shadowColor', 'textColor']) &&
    (parsePaint(value['fillPaint']) !== null || isSafeCssColor(value['backgroundColor'])) &&
    isOneOf(value['borderStyle'], ['solid', 'dashed', 'dotted'])
  );
}

function isCalloutTypography(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['fontSize', 'maxWidth', 'lineHeight', 'letterSpacing'],
      [
        'fontFamily',
        'fontStyle',
        'fontWeight',
        'direction',
        'hyphens',
        'textAlign',
        'textDecoration',
        'wordBreak',
      ]
    ) &&
    isOneOf(value['fontFamily'], ['sans', 'serif', 'mono', 'cursive']) &&
    isOneOf(value['fontStyle'], ['normal', 'italic']) &&
    isOneOf(value['fontWeight'], ['normal', 'bold']) &&
    isOneOf(value['direction'], ['auto', 'ltr', 'rtl']) &&
    isOneOf(value['hyphens'], ['none', 'auto']) &&
    isOneOf(value['textAlign'], ['left', 'center', 'right', 'justify']) &&
    isOneOf(value['textDecoration'], ['none', 'underline']) &&
    isOneOf(value['wordBreak'], ['normal', 'break-word'])
  );
}

function isCalloutTitle(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['dividerWidth', 'fontSize', 'letterSpacing', 'lineHeight'],
      [
        'backgroundColor',
        'dividerColor',
        'dividerStyle',
        'fontFamily',
        'fontStyle',
        'fontWeight',
        'direction',
        'textAlign',
        'textDecoration',
        'textColor',
      ],
      ['enabled']
    ) &&
    hasSafeColorFields(value, ['backgroundColor', 'dividerColor', 'textColor']) &&
    isOneOf(value['dividerStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['fontFamily'], ['sans', 'serif', 'mono', 'cursive']) &&
    isOneOf(value['fontStyle'], ['normal', 'italic']) &&
    isOneOf(value['fontWeight'], ['normal', 'bold']) &&
    isOneOf(value['direction'], ['auto', 'ltr', 'rtl']) &&
    isOneOf(value['textAlign'], ['left', 'center', 'right', 'justify']) &&
    isOneOf(value['textDecoration'], ['none', 'underline'])
  );
}

function isCalloutBadge(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['size', 'borderWidth', 'fontSize'],
      [
        'text',
        'placement',
        'shape',
        'backgroundColor',
        'backgroundColorSource',
        'textColor',
        'textColorSource',
        'borderColor',
        'borderColorSource',
        'fontWeight',
      ],
      ['enabled']
    ) &&
    hasSafeColorFields(value, ['backgroundColor', 'borderColor', 'textColor']) &&
    isOneOf(value['placement'], ['title-start', 'title-end', 'body-start']) &&
    isOneOf(value['shape'], ['circle', 'rounded', 'square']) &&
    ['backgroundColorSource', 'textColorSource', 'borderColorSource'].every((key) =>
      isOneOf(value[key], ['custom', 'frame-border', 'frame-fill', 'accent'])
    ) &&
    isOneOf(value['fontWeight'], ['normal', 'bold'])
  );
}

function isCalloutAccent(value: unknown): boolean {
  return (
    hasFields(value, ['width'], ['color', 'lineStyle', 'side'], ['enabled']) &&
    isSafeCssColor(value['color']) &&
    isOneOf(value['lineStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['side'], ['top', 'right', 'bottom', 'left'])
  );
}

function isCalloutColorBindings(value: unknown): boolean {
  return (
    hasFields(value, [], ['accent', 'connector', 'shadow', 'surfaceBackground', 'surfaceBorder']) &&
    ['accent', 'connector', 'surfaceBackground', 'surfaceBorder'].every((key) =>
      isOneOf(value[key], ['custom', 'frame-border', 'frame-fill'])
    ) &&
    isOneOf(value['shadow'], ['custom', 'surface-background', 'surface-border'])
  );
}

function isCalloutConnector(value: unknown): boolean {
  if (
    !hasFields(
      value,
      ['blockMarkerSize', 'frameMarkerSize', 'wedgeSize', 'width'],
      ['blockMarker', 'color', 'frameMarker', 'kind', 'lineStyle', 'routing']
    )
  )
    return false;
  const corner = value['cornerStyle'];
  const curve = value['curve'];
  const spacing = value['spacing'];
  return (
    isSafeCssColor(value['color']) &&
    isOneOf(value['blockMarker'], ['none', 'circle', 'ring-dot', 'square', 'diamond', 'arrow']) &&
    isOneOf(value['frameMarker'], ['none', 'circle', 'ring-dot', 'square', 'diamond', 'arrow']) &&
    isOneOf(value['kind'], ['none', 'wedge', 'line']) &&
    isOneOf(value['lineStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['routing'], ['straight', 'elbow', 'polyline', 'curve']) &&
    hasFields(corner, ['radius'], ['kind']) &&
    isOneOf(corner['kind'], ['sharp', 'rounded']) &&
    hasFields(curve, ['curvature'], ['mode']) &&
    isOneOf(curve['mode'], ['auto', 'manual']) &&
    isOptionalPoint(curve['startHandle'], ['x', 'y']) &&
    isOptionalPoint(curve['endHandle'], ['x', 'y']) &&
    hasFields(spacing, ['frameGap', 'blockGap', 'obstacleMargin', 'minimumEndSegment'])
  );
}

export function isCalloutSettings(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const content = value['content'];
  const placement = value['placement'];
  const style = value['style'];
  if (
    !(
      typeof value['enabled'] === 'boolean' &&
      isRecord(content) &&
      typeof content['bodyHtml'] === 'string' &&
      content['bodyHtml'].length <= 200_000 &&
      typeof content['titleText'] === 'string' &&
      content['titleText'].length <= 10_000 &&
      isOptionalString(value['instanceId'], 256) &&
      isRecord(placement) &&
      isRecord(style) &&
      isOptionalString(value['sourcePresetId'], 256) &&
      isOneOf(placement['anchor'], FRAME_ANCHORS) &&
      isOneOf(placement['side'], ['top', 'bottom', 'left', 'right', 'auto']) &&
      isOptionalPoint(placement['manualPlacement'], ['centerOffsetX', 'centerOffsetY']) &&
      isOptionalFinite(placement['connectorBasePosition']) &&
      isOptionalFinite(placement['connectorBaseWidth']) &&
      isOptionalFinite(placement['connectorFramePosition']) &&
      isOptionalPoint(placement['connectorWaypoint'], ['centerOffsetX', 'centerOffsetY']) &&
      isOptionalCalloutAttachments(placement['connectorAttachments']) &&
      typeof style['customCss'] === 'string' &&
      validateCalloutCustomCss(style['customCss']).error === null
    )
  )
    return false;
  return (
    isCalloutSurface(style['surface']) &&
    isCalloutTypography(style['typography']) &&
    isCalloutTitle(style['title']) &&
    isCalloutBadge(style['badge']) &&
    isCalloutAccent(style['accentEdge']) &&
    isCalloutColorBindings(style['colorBindings']) &&
    isCalloutConnector(style['connector'])
  );
}

export function normalizeCalloutSettings(value: unknown) {
  if (value === undefined) return undefined;
  if (!isCalloutSettings(value) || !isRecord(value)) return null;
  const style = value['style'] as Record<string, unknown>;
  const surface = style['surface'] as Record<string, unknown>;
  const fillPaint =
    parsePaint(surface['fillPaint']) ?? createSolidPaint(surface['backgroundColor'] as string);
  const { backgroundColor: _legacyBackgroundColor, ...surfaceWithoutLegacy } = surface;
  return {
    ...structuredClone(value),
    style: {
      ...structuredClone(style),
      surface: { ...structuredClone(surfaceWithoutLegacy), fillPaint },
    },
  } as unknown as import('@sniptale/runtime-contracts/highlighter/callout').CalloutSettings;
}
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';
import { validateCalloutCustomCss } from '../callout-custom-css';
import { validateCssPolicyString } from '../css-sanitizer/css';
import { validateStepBadgeCustomCss } from '../step-badge-custom-css';
import { isReservedFrameCssProperty } from '../style/decoration';
import type { AppliedBorderSettings, BlurSettings } from '@sniptale/ui/highlighter-style/types';
import { multiplyColorAlpha, normalizeColor } from '@sniptale/foundation/color';
import { createSolidPaint, parsePaint } from '@sniptale/foundation/paint';
