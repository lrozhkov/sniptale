import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactLineTrigger, type CompactCommand } from '..';
import { TablerColorIcon, TypeOutlineColorIcon } from '../color-icon';
import { TablerIcon } from '../tabler-icon';
import {
  canUseRichShapeRoughControls,
  resolveRichShapeCapabilities,
} from '../../tools/rich-shape/capabilities';
import { RichShapeEffectsSection } from '../../tools/rich-shape/effects';
import { RichShapeFillSection } from '../../tools/rich-shape/fill';
import { RichShapeLineSection } from '../../tools/rich-shape/line';
import { RichShapeTailSection } from '../../tools/rich-shape/tail';
import { RichShapeTextSection } from '../../tools/rich-shape/text';
import type { RichShapeControlsProps } from '../../tools/rich-shape/types';
import type { ToolCommandParams } from './types';

function createRichShapeControlsProps(params: ToolCommandParams): RichShapeControlsProps | null {
  if (!params.richShapeSelection) {
    return null;
  }

  return {
    applyRichShapePatch: params.applyRichShapePatch,
    arrangeSelection: params.arrangeSelection,
    capabilities: resolveRichShapeCapabilities(params.richShapeSelection),
    recentColors: params.recentColors,
    roughCapable: canUseRichShapeRoughControls(params.richShapeSelection),
    shape: params.richShapeSelection,
    shapeFillPalette: params.shapeFillPalette,
    shapeStrokePalette: params.shapeStrokePalette,
    textColorPalette: params.textColorPalette,
    toNumber: params.toNumber,
    updateColor: params.updateColor,
  };
}

function hasCapability(
  props: RichShapeControlsProps,
  capability: RichShapeControlsProps['capabilities'][number]
) {
  return props.capabilities.includes(capability);
}

function resolveRichShapeFillTriggerColor(props: RichShapeControlsProps) {
  if (props.shape.rough.enabled && props.shape.rough.fillColor) {
    return props.shape.rough.fillColor;
  }

  if (props.shape.style.fill.type === 'solid') {
    return props.shape.style.fill.color;
  }

  if (props.shape.style.fill.type === 'gradient') {
    return props.shape.style.fill.stops[0]?.color ?? '#ffffff';
  }

  return '#ffffff';
}

function resolveRichShapeFillTriggerOpacity(props: RichShapeControlsProps) {
  if (props.shape.rough.enabled) {
    return 1 - props.shape.rough.fillTransparency;
  }

  return 1 - props.shape.style.fillTransparency;
}

function buildRichShapeLineCommand(props: RichShapeControlsProps): CompactCommand | null {
  if (!hasCapability(props, 'line')) {
    return null;
  }

  const triggerStyle =
    props.shape.style.line.dashStyle === 'dot' ? 'dotted' : props.shape.style.line.dashStyle;

  return {
    id: 'rich-shape-line',
    icon: 'trajectory',
    title: translate('editor.compact.richShapeLine'),
    trigger: (
      <CompactLineTrigger
        color={props.shape.style.line.color}
        style={triggerStyle}
        width={props.shape.style.line.width}
      />
    ),
    content: (
      <CompactCommandField label={translate('editor.compact.richShapeLine')}>
        <RichShapeLineSection {...props} compact />
      </CompactCommandField>
    ),
  };
}

function buildRichShapeFillCommand(props: RichShapeControlsProps): CompactCommand | null {
  if (!hasCapability(props, 'fill')) {
    return null;
  }

  return {
    id: 'rich-shape-fill',
    icon: 'color',
    title: translate('editor.compact.richShapeFill'),
    trigger: (
      <TablerColorIcon
        color={resolveRichShapeFillTriggerColor(props)}
        icon={
          resolveRichShapeFillTriggerOpacity(props) <= 0 ? 'tabler:bucket-off' : 'tabler:bucket'
        }
        opacity={resolveRichShapeFillTriggerOpacity(props)}
      />
    ),
    content: (
      <CompactCommandField label={translate('editor.compact.richShapeFill')}>
        <RichShapeFillSection {...props} compact />
      </CompactCommandField>
    ),
  };
}

function buildRichShapeTextCommand(props: RichShapeControlsProps): CompactCommand | null {
  if (!hasCapability(props, 'text')) {
    return null;
  }

  return {
    id: 'rich-shape-text',
    icon: 'text',
    title: translate('editor.compact.richShapeText'),
    trigger: <TypeOutlineColorIcon color={props.shape.text.color} />,
    content: (
      <CompactCommandField label={translate('editor.compact.richShapeText')}>
        <RichShapeTextSection {...props} compact />
      </CompactCommandField>
    ),
  };
}

function buildRichShapeEffectsCommand(props: RichShapeControlsProps): CompactCommand | null {
  if (!hasCapability(props, 'effects')) {
    return null;
  }

  return {
    id: 'rich-shape-effects',
    icon: 'opacity',
    title: translate('editor.compact.richShapeEffects'),
    trigger:
      props.shape.effects.shadow.enabled && props.shape.effects.shadow.opacity > 0 ? (
        <TablerColorIcon
          color={props.shape.effects.shadow.color}
          icon="tabler:shadow"
          opacity={props.shape.effects.shadow.opacity}
        />
      ) : (
        <TablerIcon icon="tabler:shadow-off" />
      ),
    content: (
      <CompactCommandField label={translate('editor.compact.richShapeEffects')}>
        <RichShapeEffectsSection {...props} />
      </CompactCommandField>
    ),
  };
}

function buildRichShapeTailCommand(props: RichShapeControlsProps): CompactCommand | null {
  if (!props.shape.callout) {
    return null;
  }

  return {
    id: 'rich-shape-tail',
    icon: 'preset',
    title: translate('editor.compact.richShapeTail'),
    trigger: <TablerIcon icon="tabler:route" />,
    content: (
      <CompactCommandField label={translate('editor.compact.richShapeTail')}>
        <RichShapeTailSection {...props} compact />
      </CompactCommandField>
    ),
  };
}

export function buildRichShapeCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const props = createRichShapeControlsProps(params);

  if (!props) {
    return [];
  }

  const commands: Array<CompactCommand | null> = [
    buildRichShapeLineCommand(props),
    buildRichShapeFillCommand(props),
    buildRichShapeTextCommand(props),
    buildRichShapeTailCommand(props),
    buildRichShapeEffectsCommand(props),
  ];

  return commands.filter((command): command is CompactCommand => command !== null);
}
