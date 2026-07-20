import { EDITOR_TOOL_TEXT_BACKGROUND_PALETTE } from '../../../../../../features/editor/document/constants';
import { translate } from '../../../../../../platform/i18n';
import {
  CompactColorSwatchTrigger,
  CompactCommandField,
  CompactCommandToken,
  type CompactCommand,
} from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { ColorField, NumericRow } from '../../../../../chrome/ui';

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildTextAppearanceBackgroundCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.text;

  return {
    id: 'text-background',
    title: translate('editor.compact.backgroundColor'),
    trigger: (
      <CompactColorSwatchTrigger
        color={settings.backgroundColor}
        opacity={settings.backgroundOpacity}
      />
    ),
    value: settings.backgroundColor,
    content: (
      <CompactCommandField
        label={translate('editor.compact.backgroundColor')}
        value={settings.backgroundColor}
      >
        <ColorField
          title={translate('editor.compact.backgroundColor')}
          label={translate('editor.compact.backgroundColor')}
          value={settings.backgroundColor}
          recentColors={params.recentColors}
          palette={EDITOR_TOOL_TEXT_BACKGROUND_PALETTE}
          onChange={(color) =>
            params.updateColor((next) => params.applyTextPatch({ backgroundColor: next }), color)
          }
          onPreviewChange={(color) =>
            params.previewColor((next) => params.applyTextPatch({ backgroundColor: next }), color)
          }
          onPreviewReset={(color) =>
            params.previewColor((next) => params.applyTextPatch({ backgroundColor: next }), color)
          }
        />
      </CompactCommandField>
    ),
  };
}

export function buildTextAppearanceBackgroundOpacityCommand(
  params: ToolCommandParams
): CompactCommand {
  const settings = params.inspectorToolSettings.text;
  const label = translate('editor.compact.textBackgroundOpacity');
  const value = `${Math.round(settings.backgroundOpacity * 100)}%`;

  return {
    id: 'text-background-opacity',
    title: label,
    trigger: (
      <CompactCommandToken>
        {translate('editor.compact.backgroundOpacityShort')}
      </CompactCommandToken>
    ),
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <NumericRow
          label={label}
          value={Math.round(settings.backgroundOpacity * 100)}
          unit="%"
          min={0}
          max={100}
          step={5}
          onPreviewValue={(backgroundOpacity) =>
            params.previewTextPatch({ backgroundOpacity: clampUnit(backgroundOpacity / 100) })
          }
          onCommitValue={(backgroundOpacity) => {
            params.previewTextPatch({ backgroundOpacity: clampUnit(backgroundOpacity / 100) });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 0, max: 100, step: 5 }}
        />
      </CompactCommandField>
    ),
  };
}
