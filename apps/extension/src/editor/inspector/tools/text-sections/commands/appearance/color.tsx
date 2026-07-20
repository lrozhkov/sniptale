import { EDITOR_TOOL_TEXT_COLOR_PALETTE } from '../../../../../../features/editor/document/constants';
import { translate } from '../../../../../../platform/i18n';
import {
  CompactColorSwatchTrigger,
  CompactCommandField,
  CompactCommandToken,
  type CompactCommand,
} from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { ColorField, NumericRow } from '../../../../../chrome/ui';

export function buildTextAppearanceColorCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.text;

  return {
    id: 'text-color',
    title: translate('editor.compact.textColor'),
    trigger: (
      <CompactColorSwatchTrigger
        color={settings.textColor}
        mode="text"
        opacity={settings.textOpacity}
      />
    ),
    value: settings.textColor,
    content: (
      <CompactCommandField label={translate('editor.compact.textColor')} value={settings.textColor}>
        <ColorField
          title={translate('editor.compact.textColor')}
          label={translate('editor.compact.textColor')}
          value={settings.textColor}
          recentColors={params.recentColors}
          palette={EDITOR_TOOL_TEXT_COLOR_PALETTE}
          onChange={(color) =>
            params.updateColor((next) => params.applyTextPatch({ textColor: next }), color)
          }
          onPreviewChange={(color) =>
            params.previewColor((next) => params.applyTextPatch({ textColor: next }), color)
          }
          onPreviewReset={(color) =>
            params.previewColor((next) => params.applyTextPatch({ textColor: next }), color)
          }
        />
      </CompactCommandField>
    ),
  };
}

export function buildTextAppearanceOpacityCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.text;
  const label = translate('editor.compact.opacity');
  const value = `${Math.round(settings.textOpacity * 100)}%`;

  return {
    id: 'text-opacity',
    title: label,
    trigger: <CompactCommandToken>OP</CompactCommandToken>,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <NumericRow
          label={label}
          value={Math.round(settings.textOpacity * 100)}
          unit="%"
          min={0}
          max={100}
          step={5}
          onPreviewValue={(textOpacity) =>
            params.previewTextPatch({ textOpacity: Math.min(1, Math.max(0, textOpacity / 100)) })
          }
          onCommitValue={(textOpacity) => {
            params.previewTextPatch({ textOpacity: Math.min(1, Math.max(0, textOpacity / 100)) });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 0, max: 100, step: 5 }}
        />
      </CompactCommandField>
    ),
  };
}
