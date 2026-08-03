import type { TranslationKey } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';

export function getElementKindLabelKey(kind: ScenarioElement['kind']): TranslationKey {
  const keys = {
    arrow: 'scenario.editor.arrow',
    callout: 'scenario.editor.callout',
    code: 'scenario.editor.code',
    image: 'scenario.editor.image',
    line: 'scenario.editor.line',
    shape: 'scenario.editor.shape',
    text: 'scenario.editor.text',
  } satisfies Record<ScenarioElement['kind'], TranslationKey>;

  return keys[kind];
}
