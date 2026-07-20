import { disableHighlighterRuntime as disableHighlighterRuntimeBinding } from './mode.disable';
import { enableHighlighterRuntime as enableHighlighterRuntimeBinding } from './mode.enable';

export function enableHighlighterRuntime(
  ...args: Parameters<typeof enableHighlighterRuntimeBinding>
): ReturnType<typeof enableHighlighterRuntimeBinding> {
  return enableHighlighterRuntimeBinding(...args);
}

export function disableHighlighterRuntime(
  ...args: Parameters<typeof disableHighlighterRuntimeBinding>
): ReturnType<typeof disableHighlighterRuntimeBinding> {
  return disableHighlighterRuntimeBinding(...args);
}
