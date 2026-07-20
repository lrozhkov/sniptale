import type { CompactCommand } from '../../../compact';
import { TablerColorIcon } from '../../../compact/color-icon';
import { buildShadowCompactCommand } from '../../../compact/tool-commands/shadow';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import { buildTextAppearanceCommands } from './appearance';
import { buildTextTypographyCommands } from './typography';

export function buildTextCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.text;
  const shadowColor = settings.shadowColor ?? settings.textColor;

  return [
    ...buildTextAppearanceCommands(params),
    ...buildTextTypographyCommands(params),
    buildShadowCompactCommand({
      id: 'text-shadow',
      icon: 'opacity',
      fallbackColor: settings.textColor,
      params,
      palette: params.textColorPalette,
      settings,
      trigger: (
        <TablerColorIcon
          color={shadowColor}
          icon={settings.shadow > 0 ? 'tabler:shadow' : 'tabler:shadow-off'}
          opacity={settings.shadow > 0 ? 1 : 0.65}
          showUnderline={settings.shadow > 0}
        />
      ),
      applyPatch: params.applyTextPatch,
      previewPatch: params.previewTextPatch,
    }),
  ];
}
