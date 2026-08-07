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
};

type OverwriteInput = CreateInput & { id: string };

export function createCalloutSaveSection(args: {
  create: (input: CreateInput) => Promise<boolean>;
  error: string | null;
  isSaving: boolean;
  overwrite: (input: OverwriteInput) => Promise<boolean>;
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
    onCreate: (name) =>
      args.create({
        content: { titleText: args.settings.content.titleText },
        name,
        placement,
        style: args.settings.style,
      }),
    onOverwrite: (presetId) => {
      const preset = args.presets.find((item) => item.id === presetId);
      if (!preset) return Promise.resolve(false);
      return args.overwrite({
        id: preset.id,
        content: { titleText: args.settings.content.titleText },
        name: preset.name,
        placement,
        style: args.settings.style,
      });
    },
    presets: args.presets,
  };
}
