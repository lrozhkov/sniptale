import { createCanvasInsertIntent } from '@sniptale/runtime-contracts/canvas-tools';
import { createCanvasInsertToolAction, type CanvasToolDescriptorKind } from './descriptors';
import type { CanvasToolAction } from './types';

export type CommonCanvasPointInsertKind = 'arrow' | 'callout' | 'code' | 'line' | 'shape' | 'text';

type CommonCanvasPointInsertActionDescriptor<TTarget extends string> = {
  active?: boolean | undefined;
  group?: CanvasToolAction['group'] | undefined;
  id?: string | undefined;
  kind: CommonCanvasPointInsertKind;
  label: string;
  target: TTarget;
  onSelect: (target: TTarget) => void;
};

const DESCRIPTOR_KIND_BY_COMMON_INSERT_KIND = {
  arrow: 'arrow',
  callout: 'callout',
  code: 'code',
  line: 'line',
  shape: 'shape',
  text: 'text',
} satisfies Record<CommonCanvasPointInsertKind, CanvasToolDescriptorKind>;

export function createCommonCanvasPointInsertAction<TTarget extends string>(
  descriptor: CommonCanvasPointInsertActionDescriptor<TTarget>
): CanvasToolAction {
  const intent = createCanvasInsertIntent({
    kind: DESCRIPTOR_KIND_BY_COMMON_INSERT_KIND[descriptor.kind],
    placement: 'canvas-point',
    target: descriptor.target,
  });

  return createCanvasInsertToolAction({
    id: descriptor.id ?? descriptor.kind,
    intent,
    label: descriptor.label,
    onSelect: () => descriptor.onSelect(descriptor.target),
    ...(descriptor.active === undefined ? {} : { active: descriptor.active }),
    ...(descriptor.group === undefined ? {} : { group: descriptor.group }),
  });
}
