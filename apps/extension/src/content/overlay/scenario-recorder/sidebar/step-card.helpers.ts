import type { MouseEvent } from 'react';

export const SCENARIO_RECORDER_RAIL_BUTTON_CLASS_NAME = `flex h-7 w-7 items-center justify-center rounded-full border
  border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_78%,transparent)]
  bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_48%,transparent)]
  transition-colors hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_72%,transparent)]
  hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]`;

export function getScenarioRecorderSidebarStepCardClassName(highlighted: boolean) {
  return [
    'group relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-[16px] border',
    'overflow-hidden p-2.5 transition-colors duration-300',
    highlighted
      ? [
          'animate-[pulse_1.6s_ease-out_1]',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-border-soft)_82%)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_4%,var(--sniptale-color-surface-hover)_96%)]',
        ].join(' ')
      : [
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
          'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,transparent)]',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_60%,transparent)]',
        ].join(' '),
  ].join(' ');
}

export function handleStepActionClick(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function handleStepDrop(args: {
  dragStepId: string | null;
  stepId: string;
  stepPosition: number;
  onMoveStep: (stepId: string, toIndex: number) => void;
  setDragStepId: (stepId: string | null) => void;
}) {
  if (!args.dragStepId || args.dragStepId === args.stepId) {
    return;
  }

  args.onMoveStep(args.dragStepId, args.stepPosition);
  args.setDragStepId(null);
}
