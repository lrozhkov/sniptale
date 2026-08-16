import type { StepBadgeAnchor } from './step-badge';
import type { Paint } from '@sniptale/foundation/paint';
import type { AnnotationTemplateTagId } from './annotation-template-tags';
import type { AnnotationSessionDefaults } from './border-preset';

export type CalloutAnchor = StepBadgeAnchor;
export type CalloutSide = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export type CalloutFontFamily = 'sans' | 'serif' | 'mono' | 'cursive';
export type CalloutConnectorKind = 'none' | 'wedge' | 'line';
export type CalloutConnectorRouting = 'straight' | 'elbow' | 'polyline' | 'curve';
export type CalloutLineStyle = 'solid' | 'dashed' | 'dotted';
export type CalloutTextDirection = 'auto' | 'ltr' | 'rtl';
export type CalloutAttachmentMode = 'auto' | 'anchor' | 'free';
export type CalloutConnectorMarker =
  | 'none'
  | 'circle'
  | 'ring-dot'
  | 'square'
  | 'diamond'
  | 'arrow';
export type CalloutPresetOrigin = 'system' | 'user';
export type CalloutColorSource = 'custom' | 'frame-border' | 'frame-fill';
export type CalloutShadowColorSource = 'custom' | 'surface-background' | 'surface-border';
export type CalloutAccentSide = 'top' | 'right' | 'bottom' | 'left';
export type CalloutBadgeColorSource = CalloutColorSource | 'accent';

export const SYSTEM_CALLOUT_PRESET_KEYS = [
  'system-callout-bubble',
  'system-callout-card',
  'system-callout-text',
  'system-callout-pointer-note',
  'system-callout-header-card',
  'system-callout-framed-note',
  'system-callout-ribbon',
  'system-callout-sticky',
  'system-callout-terminal',
  'system-callout-editorial-caption',
  'system-callout-editorial-quote',
  'system-callout-editorial-proof',
  'system-callout-retro-sunset',
  'system-callout-retro-arcade',
  'system-callout-retro-memphis',
] as const;

export type SystemCalloutPresetKey = (typeof SYSTEM_CALLOUT_PRESET_KEYS)[number];

export interface CalloutManualPlacement {
  centerOffsetX: number;
  centerOffsetY: number;
}

export type CalloutConnectorWaypoint = CalloutManualPlacement;

export interface CalloutPoint {
  x: number;
  y: number;
}

export interface CalloutAttachment {
  mode: CalloutAttachmentMode;
  anchorId?: string | undefined;
  perimeterPosition?: number | undefined;
}

export interface CalloutConnectorAttachments {
  frame: CalloutAttachment;
  block: CalloutAttachment;
}

export interface CalloutContent {
  bodyHtml: string;
  titleText: string;
}

export interface CalloutPlacement {
  anchor: CalloutAnchor;
  side: CalloutSide;
  connectorAttachments?: CalloutConnectorAttachments | undefined;
  manualPlacement?: CalloutManualPlacement | undefined;
  connectorBasePosition?: number | undefined;
  connectorBaseWidth?: number | undefined;
  connectorFramePosition?: number | undefined;
  connectorWaypoint?: CalloutConnectorWaypoint | undefined;
}

export interface CalloutSurfaceStyle {
  fillPaint: Paint;
  borderColor: string;
  borderStyle: CalloutLineStyle;
  borderWidth: number;
  paddingX: number;
  paddingY: number;
  radius: number;
  shadow: number;
  shadowColor: string;
  textColor: string;
}

export interface CalloutTypographyStyle {
  fontFamily: CalloutFontFamily;
  fontSize: number;
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  maxWidth: number;
  lineHeight: number;
  letterSpacing: number;
  direction: CalloutTextDirection;
  hyphens: 'none' | 'auto';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline';
  wordBreak: 'normal' | 'break-word';
}

export interface CalloutTitleStyle {
  fillPaint: Paint;
  fillMode: 'separate' | 'unified';
  dividerColor: string;
  dividerStyle: CalloutLineStyle;
  dividerWidth: number;
  enabled: boolean;
  fontFamily: CalloutFontFamily;
  fontSize: number;
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  letterSpacing: number;
  lineHeight: number;
  direction: CalloutTextDirection;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline';
  textColor: string;
}

export interface CalloutConnectorSpacing {
  frameGap: number;
  blockGap: number;
  obstacleMargin: number;
  minimumEndSegment: number;
}

export interface CalloutCurveSettings {
  mode: 'auto' | 'manual';
  curvature: number;
  startHandle?: CalloutPoint | undefined;
  endHandle?: CalloutPoint | undefined;
}

export interface CalloutConnectorCornerStyle {
  kind: 'sharp' | 'rounded';
  radius: number;
}

export interface CalloutConnectorStyle {
  blockMarker: CalloutConnectorMarker;
  blockMarkerSize: number;
  color: string;
  cornerStyle: CalloutConnectorCornerStyle;
  curve: CalloutCurveSettings;
  frameMarker: CalloutConnectorMarker;
  frameMarkerSize: number;
  kind: CalloutConnectorKind;
  lineStyle: CalloutLineStyle;
  routing: CalloutConnectorRouting;
  spacing: CalloutConnectorSpacing;
  wedgeSize: number;
  width: number;
}

export interface CalloutBadgeSettings {
  enabled: boolean;
  text: string;
  placement: 'title-start' | 'title-end' | 'body-start';
  shape: 'circle' | 'rounded' | 'square';
  size: number;
  backgroundColor: string;
  backgroundColorSource: CalloutBadgeColorSource;
  textColor: string;
  textColorSource: CalloutBadgeColorSource;
  borderColor: string;
  borderColorSource: CalloutBadgeColorSource;
  borderWidth: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
}

export interface CalloutColorBindings {
  accent: CalloutColorSource;
  connector: CalloutColorSource;
  shadow: CalloutShadowColorSource;
  surfaceBackground: CalloutColorSource;
  surfaceBorder: CalloutColorSource;
}

export interface CalloutAccentEdgeStyle {
  color: string;
  enabled: boolean;
  lineStyle: CalloutLineStyle;
  side: CalloutAccentSide;
  width: number;
}

export interface CalloutVisualStyle {
  accentEdge: CalloutAccentEdgeStyle;
  badge: CalloutBadgeSettings;
  colorBindings: CalloutColorBindings;
  connector: CalloutConnectorStyle;
  customCss: string;
  surface: CalloutSurfaceStyle;
  title: CalloutTitleStyle;
  typography: CalloutTypographyStyle;
}

export interface CalloutSettings {
  content: CalloutContent;
  enabled: boolean;
  /** Stable identity for independently editable callouts attached to the same frame. */
  instanceId?: string | undefined;
  placement: CalloutPlacement;
  sourcePresetId?: string | undefined;
  style: CalloutVisualStyle;
}

export type CalloutSettingsPatch = {
  content?: Partial<CalloutContent>;
  enabled?: boolean;
  instanceId?: string | undefined;
  placement?: Partial<CalloutPlacement>;
  sourcePresetId?: string | undefined;
  style?: {
    accentEdge?: Partial<CalloutAccentEdgeStyle>;
    badge?: Partial<CalloutBadgeSettings>;
    colorBindings?: Partial<CalloutColorBindings>;
    connector?: Partial<Omit<CalloutConnectorStyle, 'cornerStyle' | 'curve' | 'spacing'>> & {
      cornerStyle?: Partial<CalloutConnectorCornerStyle>;
      curve?: Partial<CalloutCurveSettings>;
      spacing?: Partial<CalloutConnectorSpacing>;
    };
    customCss?: string;
    surface?: Partial<CalloutSurfaceStyle>;
    title?: Partial<CalloutTitleStyle>;
    typography?: Partial<CalloutTypographyStyle>;
  };
};

export interface CalloutPreset {
  basedOnRevision?: number | undefined;
  customized?: boolean | undefined;
  content: Pick<CalloutContent, 'titleText'>;
  enabled?: boolean | undefined;
  id: string;
  name: string;
  order: number;
  origin?: CalloutPresetOrigin | undefined;
  placement: Pick<CalloutPlacement, 'anchor' | 'side' | 'connectorAttachments'>;
  style: CalloutVisualStyle;
  systemPresetKey?: SystemCalloutPresetKey | undefined;
  tagIds: AnnotationTemplateTagId[];
}

export interface CalloutPresetCatalog {
  catalogCustomized: boolean;
  defaultPresetId: string;
  newSessionDefaults?: AnnotationSessionDefaults;
  presets: CalloutPreset[];
  systemCatalogRevision: number;
}

export interface LegacyCalloutSettings {
  anchor: CalloutAnchor;
  bgColor: string;
  enabled: boolean;
  fontFamily: CalloutFontFamily;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  htmlContent: string;
  manualPlacement?: CalloutManualPlacement | undefined;
  maxWidth: number;
  side: CalloutSide;
  tailBasePosition?: number | undefined;
  tailBaseWidth?: number | undefined;
  tailFramePosition?: number | undefined;
  tailSize: number;
  textColor: string;
  variant: 'bubble' | 'rect' | 'text-only';
}
