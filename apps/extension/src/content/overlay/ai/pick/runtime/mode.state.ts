import { createAiPickDomState } from './dom-state';
import type { AiPickModeState } from './mode.types';

export function createAiPickModeState(): AiPickModeState {
  return {
    domState: createAiPickDomState(),
    enableSequence: 0,
    isEnabled: false,
    onContentSelect: null,
    parsedTree: null,
    pendingEnable: null,
    source: null,
  };
}
