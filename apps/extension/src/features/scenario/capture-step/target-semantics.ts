import type { ScenarioTargetDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';

type ScenarioTargetSemanticFields = Pick<
  ScenarioTargetDescriptor,
  'ariaLabel' | 'role' | 'tagName' | 'text' | 'title'
>;

const SCENARIO_TARGET_TEXT_MAX_LENGTH = 120;

function trimScenarioTargetText(value: string | null | undefined, ellipsis: string): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  return text.length > SCENARIO_TARGET_TEXT_MAX_LENGTH
    ? `${text.slice(0, SCENARIO_TARGET_TEXT_MAX_LENGTH - ellipsis.length)}${ellipsis}`
    : text;
}

export function buildScenarioTargetSemanticFields(
  target: HTMLElement,
  args: { ellipsis: '...' | '…' }
): ScenarioTargetSemanticFields {
  const trimText = (value: string | null | undefined) =>
    trimScenarioTargetText(value, args.ellipsis);

  return {
    ariaLabel: trimText(target.getAttribute('aria-label')),
    role: target.getAttribute('role'),
    tagName: target.tagName.toLowerCase(),
    text: trimText(target.innerText || target.textContent),
    title: trimText(target.getAttribute('title')),
  };
}
