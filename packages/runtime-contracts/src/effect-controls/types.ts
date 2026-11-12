export type LocaleText = {
  en?: string | undefined;
  ru?: string | undefined;
  [locale: string]: string | undefined;
};

export const EFFECT_CONTROL_GROUPS = [
  'content',
  'typography',
  'appearance',
  'geometry',
  'processing',
  'animation',
  'advanced',
] as const;
export const EFFECT_CONTROL_UNITS = [
  'px',
  'percent',
  's',
  'ms',
  'deg',
  'ratio',
  'count',
  'hz',
] as const;
export const EFFECT_CONTROL_PRESENTATIONS = [
  'auto',
  'number',
  'slider',
  'text',
  'textarea',
  'dropdown',
  'segmented',
  'toggle',
  'color',
] as const;
export const EFFECT_CONTROL_ICONS = [
  'text',
  'type',
  'font-size',
  'font-weight',
  'align-left',
  'align-center',
  'align-right',
  'align-justify',
  'palette',
  'fill',
  'stroke',
  'opacity',
  'shadow',
  'blur',
  'position',
  'move',
  'size',
  'width',
  'height',
  'rotation',
  'scale',
  'spacing',
  'corner-radius',
  'shape',
  'rectangle',
  'circle',
  'pointer',
  'anchor',
  'layers',
  'layout',
  'list',
  'grid',
  'play',
  'pause',
  'clock',
  'timer',
  'duration',
  'speed',
  'repeat',
  'sparkles',
  'settings',
  'sliders',
  'check',
  'x',
  'drawing',
  'tracing',
  'path',
  'easing',
  'motion',
  'mask',
  'focus',
  'lens',
  'crop',
  'composition',
  'baseline',
  'decoration',
  'texture',
] as const;
export const EFFECT_CONTROL_ROOT_ICONS = {
  content: 'text',
  typography: 'type',
  appearance: 'palette',
  geometry: 'shape',
  processing: 'sliders',
  animation: 'play',
  advanced: 'settings',
} as const satisfies Record<EffectSemanticControlGroup, EffectControlIcon>;

export const EFFECT_CONTROL_GROUP_LIMIT = 64;
export const EFFECT_CONTROL_GROUP_DEPTH = 4;

export type EffectSemanticControlGroup = (typeof EFFECT_CONTROL_GROUPS)[number];
export type EffectControlUnit = (typeof EFFECT_CONTROL_UNITS)[number];
export type EffectControlPresentationKind = (typeof EFFECT_CONTROL_PRESENTATIONS)[number];
export type EffectControlIcon = (typeof EFFECT_CONTROL_ICONS)[number];
export type EffectControlGroup = {
  id: string;
  label: LocaleText & { en: string };
  parentId: string;
  order?: number | undefined;
  icon?: EffectControlIcon | undefined;
  collapsed?: boolean | undefined;
};

export type EffectControlPreset = {
  id: string;
  label: LocaleText & { en: string };
  theme: { id: string; label: LocaleText & { en: string } };
  style: { id: string; label: LocaleText & { en: string } };
  values: Record<string, number | string>;
};

export type EffectControlMetadata = {
  unit?: EffectControlUnit | undefined;
  presentation?: EffectControlPresentationKind | undefined;
  icon?: EffectControlIcon | undefined;
  localizedDefaultValue?: LocaleText | undefined;
  group?: string | undefined;
  order?: number | undefined;
  options?:
    | { value: number | string; label: LocaleText; icon?: EffectControlIcon | undefined }[]
    | undefined;
};

export type ControlDefinition = EffectControlMetadata &
  (
    | {
        defaultValue: string;
        id: string;
        kind: 'color' | 'text';
        label?: LocaleText | undefined;
      }
    | {
        defaultValue: number;
        id: string;
        kind: 'number';
        label?: LocaleText | undefined;
        max?: number | undefined;
        min?: number | undefined;
        step?: number | undefined;
      }
  );

/** Validated control metadata shared by animation and transition consumers. */
export interface EffectControlSet {
  controls: readonly ControlDefinition[];
  controlGroups?: readonly EffectControlGroup[] | undefined;
  controlPresets?: readonly EffectControlPreset[] | undefined;
  defaultControlPresetId?: string | undefined;
}
/** Geometry handles remain protected when a visual preset is applied. */
export interface EffectControlContext extends EffectControlSet {
  objectLayout?:
    | { handles?: readonly { xControl: string; yControl: string }[] | undefined }
    | undefined;
}
