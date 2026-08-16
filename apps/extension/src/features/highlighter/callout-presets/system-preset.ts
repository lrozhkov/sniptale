import type {
  CalloutPreset,
  CalloutVisualStyle,
  SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { cloneCalloutVisualStyle, DEFAULT_CALLOUT_PRESET_PLACEMENT } from './visual-style';

export const SYSTEM_CALLOUT_PRESET_CATALOG_REVISION = 13;

export type SystemCalloutPreset = CalloutPreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemCalloutPresetKey;
};

export function createSystemCalloutPreset(
  systemPresetKey: SystemCalloutPresetKey,
  order: number,
  theme: keyof typeof SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS,
  style: CalloutVisualStyle
): SystemCalloutPreset {
  return {
    basedOnRevision: SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
    customized: false,
    content: { titleText: '' },
    enabled: true,
    id: systemPresetKey,
    name: systemPresetKey,
    order,
    origin: 'system',
    placement: { ...DEFAULT_CALLOUT_PRESET_PLACEMENT },
    style: cloneCalloutVisualStyle(style),
    systemPresetKey,
    tagIds: [SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS[theme]],
  };
}
