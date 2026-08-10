import type {
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { CalloutSaveSectionProps } from '../../../ui/highlighter-preset-editor/callout/inspector-save';
import { getPreferredSideFromAnchor } from '../../../features/highlighter/frame-annotation/callout/geometry';

type CreateInput = {
  content: CalloutPreset['content'];
  name: string;
  placement: CalloutPreset['placement'];
  style: CalloutSettings['style'];
  tagIds?: readonly string[];
};

type OverwriteInput = CreateInput & { id: string };

export function createCalloutSaveSection(args: {
  create: (input: CreateInput) => Promise<boolean | { id?: string; outcome: string } | null>;
  error: string | null;
  isSaving: boolean;
  overwrite: (input: OverwriteInput) => Promise<boolean | { outcome: string } | null>;
  onCreated?: (templateId: string) => void;
  presets: CalloutPreset[];
  settings: CalloutSettings;
}): CalloutSaveSectionProps {
  const placement: CalloutPreset['placement'] = {
    anchor: args.settings.placement.anchor,
    connectorAttachments: args.settings.placement.connectorAttachments ?? {
      block: { mode: 'auto' },
      frame: { mode: 'auto' },
    },
    side: getPreferredSideFromAnchor(args.settings.placement.anchor) ?? 'top',
  };
  return {
    error: args.error,
    isSaving: args.isSaving,
    onCreate: async (name, tagIds) => {
      const result = await args.create({
        content: { titleText: args.settings.content.titleText },
        name,
        placement,
        style: args.settings.style,
        ...(tagIds ? { tagIds } : {}),
      });
      const saved =
        result === true || (typeof result === 'object' && result?.outcome === 'applied');
      if (!saved) return false;
      if (typeof result === 'object' && result?.id) args.onCreated?.(result.id);
      return true;
    },
    onOverwrite: async (presetId) => {
      const preset = args.presets.find((item) => item.id === presetId);
      if (!preset) return false;
      const result = await args.overwrite({
        id: preset.id,
        content: { titleText: args.settings.content.titleText },
        name: preset.name,
        placement,
        style: args.settings.style,
      });
      const saved =
        result === true || (typeof result === 'object' && result?.outcome === 'applied');
      if (saved) args.onCreated?.(preset.id);
      return saved;
    },
    presets: args.presets,
  };
}
