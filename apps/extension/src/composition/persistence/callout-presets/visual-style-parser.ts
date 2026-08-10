import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { createSolidPaint, parsePaint } from '@sniptale/foundation/paint';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';

type RecordValue = Record<string, unknown>;

function readEnum<T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T | null {
  const candidate = value ?? fallback;
  return isString(candidate) && allowed.includes(candidate as T) ? (candidate as T) : null;
}

function readNumber(
  record: RecordValue,
  key: string,
  fallback: number | undefined,
  minimum: number,
  maximum?: number
) {
  const value = record[key] ?? fallback;
  return isNumber(value) && value >= minimum && (maximum === undefined || value <= maximum)
    ? value
    : null;
}

function readColor(value: unknown, fallback?: string): string | null {
  const candidate = value ?? fallback;
  if (candidate === 'transparent') return candidate;
  if (
    !isString(candidate) ||
    (candidate.length !== 7 && candidate.length !== 9) ||
    candidate[0] !== '#'
  ) {
    return null;
  }
  return /^[0-9a-f]+$/i.test(candidate.slice(1)) ? candidate : null;
}

function readPoint(value: unknown) {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) return null;
  const x = readNumber(value, 'x', undefined, -100_000, 100_000);
  const y = readNumber(value, 'y', undefined, -100_000, 100_000);
  return x === null || y === null ? null : { x, y };
}

function readBoolean(value: unknown, fallback: boolean): boolean | null {
  const candidate = value ?? fallback;
  return isBoolean(candidate) ? candidate : null;
}

function readString(value: unknown, fallback: string, maximumLength: number): string | null {
  const candidate = value ?? fallback;
  return isString(candidate) && candidate.length <= maximumLength ? candidate : null;
}

function hasAllValues<T extends Record<string, unknown>>(
  value: T
): value is { [Key in keyof T]: Exclude<T[Key], null> } {
  return !Object.values(value).includes(null);
}

function parseAccentEdge(value: unknown): CalloutVisualStyle['accentEdge'] | null {
  const record = value === undefined ? {} : value;
  if (!isPlainRecord(record)) return null;
  const color = readColor(record['color'], '#f97316');
  const enabled = record['enabled'] ?? false;
  const lineStyle = readEnum(record['lineStyle'], 'solid', ['solid', 'dashed', 'dotted']);
  const side = readEnum(record['side'], 'left', ['top', 'right', 'bottom', 'left']);
  const width = readNumber(record, 'width', 4, 1, 12);
  return color && isBoolean(enabled) && lineStyle && side && width !== null
    ? { color, enabled, lineStyle, side, width }
    : null;
}

function parseBadge(value: unknown): CalloutVisualStyle['badge'] | null {
  const record = value === undefined ? {} : value;
  if (!isPlainRecord(record)) return null;
  const colorSources = ['custom', 'frame-border', 'frame-fill', 'accent'] as const;
  const parsed = {
    backgroundColor: readColor(record['backgroundColor'], '#f97316'),
    backgroundColorSource: readEnum(record['backgroundColorSource'], 'accent', colorSources),
    borderColor: readColor(record['borderColor'], 'transparent'),
    borderColorSource: readEnum(record['borderColorSource'], 'custom', colorSources),
    borderWidth: readNumber(record, 'borderWidth', 0, 0, 12),
    enabled: readBoolean(record['enabled'], false),
    fontSize: readNumber(record, 'fontSize', 11, 8, 32),
    fontWeight: readEnum(record['fontWeight'], 'bold', ['normal', 'bold']),
    placement: readEnum(record['placement'], 'title-start', [
      'title-start',
      'title-end',
      'body-start',
    ]),
    shape: readEnum(record['shape'], 'rounded', ['circle', 'rounded', 'square']),
    size: readNumber(record, 'size', 20, 12, 64),
    text: readString(record['text'], '1', 64),
    textColor: readColor(record['textColor'], '#ffffff'),
    textColorSource: readEnum(record['textColorSource'], 'custom', colorSources),
  };
  return hasAllValues(parsed) ? parsed : null;
}

function parseColorBindings(value: unknown): CalloutVisualStyle['colorBindings'] | null {
  const record = value === undefined ? {} : value;
  if (!isPlainRecord(record)) return null;
  const sources = ['custom', 'frame-border', 'frame-fill'] as const;
  const accent = readEnum(record['accent'], 'custom', sources);
  const connector = readEnum(record['connector'], 'custom', sources);
  const shadow = readEnum(record['shadow'], 'custom', [
    'custom',
    'surface-background',
    'surface-border',
  ]);
  const surfaceBackground = readEnum(record['surfaceBackground'], 'custom', sources);
  const surfaceBorder = readEnum(record['surfaceBorder'], 'custom', sources);
  return accent && connector && shadow && surfaceBackground && surfaceBorder
    ? { accent, connector, shadow, surfaceBackground, surfaceBorder }
    : null;
}

function parseCurve(value: unknown): CalloutVisualStyle['connector']['curve'] | null {
  const record = value === undefined ? {} : value;
  if (!isPlainRecord(record)) return null;
  const mode = readEnum(record['mode'], 'auto', ['auto', 'manual']);
  const curvature = readNumber(record, 'curvature', 0.35, 0, 1);
  const startHandle = readPoint(record['startHandle']);
  const endHandle = readPoint(record['endHandle']);
  if (!mode || curvature === null || startHandle === null || endHandle === null) return null;
  return {
    curvature,
    mode,
    ...(startHandle ? { startHandle } : {}),
    ...(endHandle ? { endHandle } : {}),
  };
}

function parseConnector(value: unknown): CalloutVisualStyle['connector'] | null {
  if (!isPlainRecord(value)) return null;
  const markers = ['none', 'circle', 'ring-dot', 'square', 'diamond', 'arrow'] as const;
  const cornerRecord = value['cornerStyle'] === undefined ? {} : value['cornerStyle'];
  const spacingRecord = value['spacing'] === undefined ? {} : value['spacing'];
  if (!isPlainRecord(cornerRecord) || !isPlainRecord(spacingRecord)) return null;
  const parsed = {
    blockMarker: readEnum(value['blockMarker'], 'none', markers),
    blockMarkerSize: readNumber(value, 'blockMarkerSize', 10, 4, 48),
    color: readColor(value['color']),
    cornerKind: readEnum(cornerRecord['kind'], 'sharp', ['sharp', 'rounded']),
    cornerRadius: readNumber(cornerRecord, 'radius', 8, 0, 64),
    curve: parseCurve(value['curve']),
    frameGap: readNumber(spacingRecord, 'frameGap', 0, 0, 128),
    frameMarker: readEnum(value['frameMarker'], 'none', markers),
    frameMarkerSize: readNumber(value, 'frameMarkerSize', 10, 4, 48),
    blockGap: readNumber(spacingRecord, 'blockGap', 0, 0, 128),
    kind: readEnum(value['kind'], 'none', ['none', 'wedge', 'line']),
    lineStyle: readEnum(value['lineStyle'], 'solid', ['solid', 'dashed', 'dotted']),
    minimumEndSegment: readNumber(spacingRecord, 'minimumEndSegment', 16, 0, 128),
    obstacleMargin: readNumber(spacingRecord, 'obstacleMargin', 0, 0, 128),
    routing: readEnum(value['routing'], 'straight', ['straight', 'elbow', 'polyline', 'curve']),
    wedgeSize: readNumber(value, 'wedgeSize', undefined, 4, 48),
    width: readNumber(value, 'width', undefined, 1, 12),
  };
  if (!hasAllValues(parsed)) return null;
  return {
    blockMarker: parsed.blockMarker,
    blockMarkerSize: parsed.blockMarkerSize,
    color: parsed.color,
    cornerStyle: { kind: parsed.cornerKind, radius: parsed.cornerRadius },
    curve: parsed.curve,
    frameMarker: parsed.frameMarker,
    frameMarkerSize: parsed.frameMarkerSize,
    kind: parsed.kind,
    lineStyle: parsed.lineStyle,
    routing: parsed.routing,
    spacing: {
      blockGap: parsed.blockGap,
      frameGap: parsed.frameGap,
      minimumEndSegment: parsed.minimumEndSegment,
      obstacleMargin: parsed.obstacleMargin,
    },
    wedgeSize: parsed.wedgeSize,
    width: parsed.width,
  };
}

function parseSurface(value: unknown): CalloutVisualStyle['surface'] | null {
  if (!isPlainRecord(value)) return null;
  const fillPaint =
    parsePaint(value['fillPaint']) ??
    (readColor(value['backgroundColor'])
      ? createSolidPaint(readColor(value['backgroundColor'])!)
      : null);
  const borderColor = readColor(value['borderColor']);
  const borderStyle = readEnum(value['borderStyle'], 'solid', ['solid', 'dashed', 'dotted']);
  const borderWidth = readNumber(value, 'borderWidth', undefined, 0, 12);
  const paddingX = readNumber(value, 'paddingX', undefined, 0, 48);
  const paddingY = readNumber(value, 'paddingY', undefined, 0, 48);
  const radius = readNumber(value, 'radius', undefined, 0, 64);
  const shadow = readNumber(value, 'shadow', undefined, 0, 100);
  const shadowColor = readColor(value['shadowColor'], '#000000');
  const textColor = readColor(value['textColor']);
  return fillPaint &&
    borderColor &&
    borderStyle &&
    borderWidth !== null &&
    paddingX !== null &&
    paddingY !== null &&
    radius !== null &&
    shadow !== null &&
    shadowColor &&
    textColor
    ? {
        fillPaint,
        borderColor,
        borderStyle,
        borderWidth,
        paddingX,
        paddingY,
        radius,
        shadow,
        shadowColor,
        textColor,
      }
    : null;
}

function parseTitle(value: unknown): CalloutVisualStyle['title'] | null {
  if (!isPlainRecord(value)) return null;
  const enabled = value['enabled'];
  const backgroundColor = readColor(value['backgroundColor']);
  const dividerColor = readColor(value['dividerColor'], 'transparent');
  const dividerStyle = readEnum(value['dividerStyle'], 'solid', ['solid', 'dashed', 'dotted']);
  const dividerWidth = readNumber(value, 'dividerWidth', 0, 0, 12);
  const direction = readEnum(value['direction'], 'auto', ['auto', 'ltr', 'rtl']);
  const fontFamily = readEnum(value['fontFamily'], 'sans', ['sans', 'serif', 'mono', 'cursive']);
  const fontSize = readNumber(value, 'fontSize', undefined, 8, 144);
  const fontStyle = readEnum(value['fontStyle'], 'normal', ['normal', 'italic']);
  const fontWeight = readEnum(value['fontWeight'], 'bold', ['normal', 'bold']);
  const letterSpacing = readNumber(value, 'letterSpacing', 0, -10, 40);
  const lineHeight = readNumber(value, 'lineHeight', 1.2, 0.8, 3);
  const textAlign = readEnum(value['textAlign'], 'left', ['left', 'center', 'right', 'justify']);
  const textDecoration = readEnum(value['textDecoration'], 'none', ['none', 'underline']);
  const textColor = readColor(value['textColor']);
  if (
    !isBoolean(enabled) ||
    !backgroundColor ||
    !dividerColor ||
    !dividerStyle ||
    dividerWidth === null ||
    !direction ||
    !fontFamily ||
    fontSize === null ||
    !fontStyle ||
    !fontWeight ||
    letterSpacing === null ||
    lineHeight === null ||
    !textAlign ||
    !textDecoration ||
    !textColor
  )
    return null;
  return {
    backgroundColor,
    dividerColor,
    dividerStyle,
    dividerWidth,
    enabled,
    direction,
    fontFamily,
    fontSize,
    fontStyle,
    fontWeight,
    letterSpacing,
    lineHeight,
    textAlign,
    textDecoration,
    textColor,
  };
}

function parseTypography(value: unknown): CalloutVisualStyle['typography'] | null {
  if (!isPlainRecord(value)) return null;
  const direction = readEnum(value['direction'], 'auto', ['auto', 'ltr', 'rtl']);
  const fontFamily = readEnum(value['fontFamily'], 'sans', ['sans', 'serif', 'mono', 'cursive']);
  const fontSize = readNumber(value, 'fontSize', undefined, 8, 72);
  const fontStyle = readEnum(value['fontStyle'], 'normal', ['normal', 'italic']);
  const fontWeight = readEnum(value['fontWeight'], 'normal', ['normal', 'bold']);
  const hyphens = readEnum(value['hyphens'], 'none', ['none', 'auto']);
  const letterSpacing = readNumber(value, 'letterSpacing', 0, -10, 40);
  const lineHeight = readNumber(value, 'lineHeight', 1.4, 0.8, 3);
  const maxWidth = readNumber(value, 'maxWidth', undefined, 80);
  const textAlign = readEnum(value['textAlign'], 'left', ['left', 'center', 'right', 'justify']);
  const textDecoration = readEnum(value['textDecoration'], 'none', ['none', 'underline']);
  const wordBreak = readEnum(value['wordBreak'], 'normal', ['normal', 'break-word']);
  return direction &&
    fontFamily &&
    fontSize !== null &&
    fontStyle &&
    fontWeight &&
    hyphens &&
    letterSpacing !== null &&
    lineHeight !== null &&
    maxWidth !== null &&
    textAlign &&
    textDecoration &&
    wordBreak
    ? {
        direction,
        fontFamily,
        fontSize,
        fontStyle,
        fontWeight,
        hyphens,
        letterSpacing,
        lineHeight,
        maxWidth,
        textAlign,
        textDecoration,
        wordBreak,
      }
    : null;
}

export function parseCalloutVisualStyle(value: unknown): CalloutVisualStyle | null {
  if (!isPlainRecord(value)) return null;
  const accentEdge = parseAccentEdge(value['accentEdge']);
  const badge = parseBadge(value['badge']);
  const colorBindings = parseColorBindings(value['colorBindings']);
  const connector = parseConnector(value['connector']);
  const surface = parseSurface(value['surface']);
  const title = parseTitle(value['title']);
  const typography = parseTypography(value['typography']);
  const customCss = value['customCss'] ?? '';
  return accentEdge &&
    badge &&
    colorBindings &&
    connector &&
    surface &&
    title &&
    typography &&
    isString(customCss) &&
    customCss.length <= 4_000
    ? { accentEdge, badge, colorBindings, connector, customCss, surface, title, typography }
    : null;
}
