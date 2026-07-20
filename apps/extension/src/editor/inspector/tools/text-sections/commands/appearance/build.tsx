import type { CompactCommand } from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import {
  buildTextAppearanceBackgroundCommand,
  buildTextAppearanceBackgroundOpacityCommand,
} from './background';
import { buildTextAppearanceColorCommand, buildTextAppearanceOpacityCommand } from './color';

export function buildTextAppearanceCommands(params: ToolCommandParams): CompactCommand[] {
  return [
    buildTextAppearanceColorCommand(params),
    buildTextAppearanceOpacityCommand(params),
    buildTextAppearanceBackgroundCommand(params),
    buildTextAppearanceBackgroundOpacityCommand(params),
  ];
}
