import type { SelectionModeRuntimeArgsInput } from '../../session/runtime-state/types';

export type {
  SelectionModeMutableLocalsGetters as MutableRefGetterArgs,
  SelectionModeMutableLocalsSetters as MutableRefSetterArgs,
} from '../../session/locals-contract';

export interface SelectionModeRuntimeSetupArgs extends Omit<
  SelectionModeRuntimeArgsInput,
  'refs' | 'showFinalFrame'
> {
  createFinalElements: () => void;
  mutableRefs: SelectionModeRuntimeArgsInput['refs'];
}
