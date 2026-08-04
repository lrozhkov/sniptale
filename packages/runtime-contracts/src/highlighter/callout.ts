import type { StepBadgeAnchor } from './step-badge';

export type CalloutAnchor = StepBadgeAnchor;
export type CalloutSide = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export type CalloutFontFamily = 'sans' | 'serif' | 'mono' | 'cursive';
export type CalloutConnectorKind = 'none' | 'wedge' | 'line';
export type CalloutConnectorRouting = 'straight' | 'elbow' | 'polyline';
export type CalloutLineStyle = 'solid' | 'dashed' | 'dotted';
export type CalloutConnectorMarker =
  | 'none'
  | 'circle'
  | 'ring-dot'
  | 'square'
  | 'diamond'
  | 'arrow';
export type CalloutPresetOrigin = 'system' | 'user';
export type CalloutColorSource = 'custom' | 'frame-border' | 'frame-fill';
export type CalloutAccentSide = 'top' | 'right' | 'bottom' | 'left';

export const SYSTEM_CALLOUT_PRESET_KEYS = [
  'system-callout-bubble',
  'system-callout-card',
  'system-callout-text',
  'system-callout-pointer-note',
  'system-callout-header-card',
  'system-callout-framed-note',
] as const;

export type SystemCalloutPresetKey = (typeof SYSTEM_CALLOUT_PRESET_KEYS)[number];

export interface CalloutManualPlacement {
  centerOffsetX: number;
  centerOffsetY: number;
}

export type CalloutConnectorWaypoint = CalloutManualPlacement;

export interface CalloutContent {
  bodyHtml: string;
  titleText: string;
}

export interface CalloutPlacement {
  anchor: CalloutAnchor;
  side: CalloutSide;
  manualPlacement?: CalloutManualPlacement | undefined;
  connectorBasePosition?: number | undefined;
  connectorBaseWidth?: number | undefined;
  connectorFramePosition?: number | undefined;
  connectorWaypoint?: CalloutConnectorWaypoint | undefined;
}

export interface CalloutSurfaceStyle {
  backgroundColor: string;
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
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline';
}

export interface CalloutTitleStyle {
  backgroundColor: string;
  dividerColor: string;
  dividerStyle: CalloutLineStyle;
  dividerWidth: number;
  enabled: boolean;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textColor: string;
}

export interface CalloutConnectorStyle {
  blockMarker: CalloutConnectorMarker;
  blockMarkerSize: number;
  color: string;
  frameMarker: CalloutConnectorMarker;
  frameMarkerSize: number;
  kind: CalloutConnectorKind;
  lineStyle: CalloutLineStyle;
  routing: CalloutConnectorRouting;
  wedgeSize: number;
  width: number;
}

export interface CalloutColorBindings {
  accent: CalloutColorSource;
  connector: CalloutColorSource;
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
  placement: CalloutPlacement;
  sourcePresetId?: string | undefined;
  style: CalloutVisualStyle;
}

export type CalloutSettingsPatch = {
  content?: Partial<CalloutContent>;
  enabled?: boolean;
  placement?: Partial<CalloutPlacement>;
  sourcePresetId?: string | undefined;
  style?: {
    accentEdge?: Partial<CalloutAccentEdgeStyle>;
    colorBindings?: Partial<CalloutColorBindings>;
    connector?: Partial<CalloutConnectorStyle>;
    customCss?: string;
    surface?: Partial<CalloutSurfaceStyle>;
    title?: Partial<CalloutTitleStyle>;
    typography?: Partial<CalloutTypographyStyle>;
  };
};

export interface CalloutPreset {
  basedOnRevision?: number | undefined;
  customized?: boolean | undefined;
  enabled?: boolean | undefined;
  id: string;
  name: string;
  order: number;
  origin?: CalloutPresetOrigin | undefined;
  placement: Pick<CalloutPlacement, 'anchor' | 'side'>;
  style: CalloutVisualStyle;
  systemPresetKey?: SystemCalloutPresetKey | undefined;
}

export interface CalloutPresetCatalog {
  catalogCustomized: boolean;
  defaultPresetId: string;
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
