import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { AIModalContent } from './body';
import type { AIModalProps } from './types';
import { useAIModalState } from '../session';

export default function AIModal(props: AIModalProps) {
  const state = useAIModalState({ isOpen: props.isOpen, isLoading: Boolean(props.isLoading) });

  if (!props.isOpen) {
    return null;
  }

  return (
    <CommandPressScope value={true}>
      <AIModalContent
        {...props}
        treeData={props.treeData ?? null}
        isLoading={props.isLoading ?? false}
        state={state}
      />
    </CommandPressScope>
  );
}
