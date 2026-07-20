import type { KeyboardEvent } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioNavigatorStepController } from './types';

export function getStepLabel(step: ScenarioStep, index: number): string {
  return step.title || translate(`scenario.editor.stepKinds.${step.kind}`) || `${index + 1}`;
}

export function getStepPreview(step: ScenarioStep): string {
  if (step.kind === 'section') {
    return '';
  }

  return step.body.trim();
}

export function handleStepRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect();
  }
}

export function handleScenarioNavigatorStepDrop(args: {
  controller: ScenarioNavigatorStepController;
  dragStepId: string | null;
  index: number;
  onSetDragStepId: (stepId: string | null) => void;
  stepId: string;
}) {
  if (!args.dragStepId || args.dragStepId === args.stepId) {
    return;
  }

  args.controller.stepActions.moveStepToPosition(args.dragStepId, args.index);
  args.onSetDragStepId(null);
}

export function getScenarioNavigatorStepRowClassName(selected: boolean): string {
  return [
    'group relative flex min-w-0 gap-2.5 overflow-hidden rounded-[16px] border p-2.5 text-left transition',
    selected
      ? [
          [
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-accent-strong)_52%,',
            'var(--sniptale-color-border-soft)_48%)]',
          ].join(''),
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_10%,var(--sniptale-color-surface-panel)_90%)]',
        ].join(' ')
      : [
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
          [
            'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_74%,',
            'var(--sniptale-color-border-accent-strong)_26%)]',
          ].join(''),
        ].join(' '),
  ].join(' ');
}

export function getScenarioNavigatorPreviewRowClassName(): string {
  return [
    'flex min-w-0 gap-2.5 overflow-hidden rounded-[16px] border p-2.5 text-left',
    'border-[var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
  ].join(' ');
}

export function getTrashRowEyebrow(step: ScenarioStep): string {
  return translate(`scenario.editor.stepKinds.${step.kind}`);
}
