import { completeDrawWorkflowFromBindings, type DrawCompletionBindings } from './draw-completion';

function completeDrawSessionFromBindings(bindings: DrawCompletionBindings): boolean {
  return completeDrawWorkflowFromBindings(bindings);
}

export function completeDrawSessionOnEnterFromBindings(bindings: DrawCompletionBindings): boolean {
  return completeDrawSessionFromBindings(bindings);
}
