import type React from 'react';
import {
  AlignHorizontalJustifyCenter,
  Circle,
  Scaling,
  Sparkles,
  Type,
  WandSparkles,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { CompactLineTrigger, type CompactCommand } from '../../inspector/compact';
import { resolveCompactCommandTrigger } from '../../inspector/compact/shared';
import { TablerIcon } from '../../inspector/compact/tabler-icon';

export type FloatingToolbarGroupKind =
  | 'templates'
  | 'content'
  | 'fill'
  | 'stroke'
  | 'geometry'
  | 'layout'
  | 'effects'
  | 'more';

export interface FloatingToolbarGroup {
  id: string;
  kind: FloatingToolbarGroupKind;
  title: string;
  trigger: React.ReactNode;
  content: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => Promise<void> | void;
  width?: 'simple' | 'style' | 'rich' | 'menu';
}

export const CANVAS_TOOLBAR_GROUP_ORDER: FloatingToolbarGroupKind[] = [
  'templates',
  'content',
  'fill',
  'stroke',
  'geometry',
  'layout',
  'effects',
  'more',
];

export const CANVAS_TOOLBAR_GROUP_TITLES: Record<FloatingToolbarGroupKind, string> = {
  templates: translate('editor.toolbar.preset'),
  content: translate('editor.toolbar.text'),
  fill: translate('editor.toolbar.fillColor'),
  stroke: translate('editor.toolbar.strokeColor'),
  geometry: translate('editor.toolbar.size'),
  layout: translate('editor.toolbar.textAlignment'),
  effects: translate('editor.toolbar.effects'),
  more: translate('editor.toolbar.moreActions'),
};

export const CANVAS_TOOLBAR_GROUP_WIDTHS: Record<
  FloatingToolbarGroupKind,
  NonNullable<FloatingToolbarGroup['width']>
> = {
  templates: 'style',
  content: 'style',
  fill: 'style',
  stroke: 'style',
  geometry: 'simple',
  layout: 'simple',
  effects: 'rich',
  more: 'menu',
};

function getTemplateGroupTrigger(commands: CompactCommand[]) {
  const templateCommand = commands.find(
    (command) => command.id.includes('template') || command.id.includes('preset')
  );
  return templateCommand ? (
    resolveCompactCommandTrigger(templateCommand)
  ) : (
    <Sparkles size={15} strokeWidth={2} />
  );
}

function getFillGroupTrigger(commands: CompactCommand[]) {
  const colorCommand = commands.find((command) => command.id.includes('color'));
  return colorCommand ? (
    resolveCompactCommandTrigger(colorCommand)
  ) : (
    <Circle size={16} strokeWidth={2} fill="currentColor" />
  );
}

function getStrokeGroupTrigger(commands: CompactCommand[]) {
  const lineCommand = commands.find(
    (command) =>
      command.id.includes('stroke') || command.id.includes('line') || command.id.includes('arrow')
  );
  return lineCommand ? resolveCompactCommandTrigger(lineCommand) : <CompactLineTrigger width={2} />;
}

export function getCanvasToolbarGroupTrigger(
  kind: FloatingToolbarGroupKind,
  commands: CompactCommand[]
) {
  if (kind === 'templates') {
    return getTemplateGroupTrigger(commands);
  }

  if (kind === 'content') {
    return <Type size={15} strokeWidth={2} />;
  }

  if (kind === 'fill') {
    return getFillGroupTrigger(commands);
  }

  if (kind === 'stroke') {
    return getStrokeGroupTrigger(commands);
  }

  if (kind === 'geometry') {
    return <Scaling size={15} strokeWidth={2} />;
  }

  if (kind === 'layout') {
    return <AlignHorizontalJustifyCenter size={15} strokeWidth={2} />;
  }

  if (kind === 'effects') {
    return <WandSparkles size={15} strokeWidth={2} />;
  }

  return <TablerIcon icon="tabler:dots-vertical" />;
}
