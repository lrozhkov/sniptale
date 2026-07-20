import type { EditorStepSettings } from '../../../features/editor/document/step-types';
import { CYRILLIC_ALPHABET, LATIN_ALPHABET } from '../../../features/highlighter/contracts';

const DEFAULT_STEP_VALUES = {
  cyrillic: 'А',
  latin: 'A',
  manual: '',
  number: '1',
} as const;

type StepValueContext = Pick<EditorStepSettings, 'alphabet' | 'type'>;
type StepValueState = StepValueContext & Pick<EditorStepSettings, 'value'>;
type StepAnnotationLike = {
  sniptaleStepAlphabet?: EditorStepSettings['alphabet'];
  sniptaleStepType?: EditorStepSettings['type'];
  sniptaleStepValue?: string;
  sniptaleType?: string;
};

function getAlphabetLetters(alphabet: EditorStepSettings['alphabet']): readonly string[] {
  return alphabet === 'cyrillic' ? CYRILLIC_ALPHABET : LATIN_ALPHABET;
}

function getDefaultEditorStepValue(context: StepValueContext): string {
  if (context.type === 'number') {
    return DEFAULT_STEP_VALUES.number;
  }

  if (context.type === 'manual') {
    return DEFAULT_STEP_VALUES.manual;
  }

  return DEFAULT_STEP_VALUES[context.alphabet];
}

function isMatchingStepAnnotation(
  annotation: StepAnnotationLike,
  context: StepValueContext
): annotation is StepAnnotationLike & { sniptaleStepValue: string } {
  if (annotation.sniptaleType !== 'step' || annotation.sniptaleStepValue === undefined) {
    return false;
  }

  if (annotation.sniptaleStepType !== undefined && annotation.sniptaleStepType !== context.type) {
    return false;
  }

  return (
    context.type !== 'letter' ||
    annotation.sniptaleStepAlphabet === undefined ||
    annotation.sniptaleStepAlphabet === context.alphabet
  );
}

export function normalizeEditorStepValue(value: string, context: StepValueContext): string {
  if (context.type === 'number') {
    return value.replace(/\D/g, '').slice(0, 2);
  }

  if (context.type === 'manual') {
    return value.trim().slice(0, 3);
  }

  const [letter] = value.trim().toUpperCase();
  if (!letter) {
    return '';
  }

  return getAlphabetLetters(context.alphabet).includes(letter) ? letter : '';
}

export function resolveEditorStepSettingsPatch(
  current: EditorStepSettings,
  patch: Partial<EditorStepSettings>
): Partial<EditorStepSettings> {
  const nextContext = {
    alphabet: patch.alphabet ?? current.alphabet,
    type: patch.type ?? current.type,
  };
  const normalized = normalizeEditorStepValue(patch.value ?? current.value, nextContext);
  const requiresSafeValue = patch.type !== undefined || patch.alphabet !== undefined;

  return {
    ...patch,
    value: requiresSafeValue ? normalized || getDefaultEditorStepValue(nextContext) : normalized,
  };
}

export function getNextEditorStepValue(settings: StepValueState): string {
  if (settings.type === 'number') {
    const current = Number.parseInt(normalizeEditorStepValue(settings.value, settings), 10) || 0;
    return String(Math.min(99, current + 1));
  }

  if (settings.type === 'manual') {
    return normalizeEditorStepValue(settings.value, settings);
  }

  const alphabet = getAlphabetLetters(settings.alphabet);
  const current = normalizeEditorStepValue(settings.value, settings);
  const index = alphabet.indexOf(current);
  const fallback = getDefaultEditorStepValue(settings);

  return alphabet[index + 1] ?? fallback;
}

export function deriveNextEditorStepValueFromAnnotations(
  context: StepValueContext,
  annotations: readonly StepAnnotationLike[]
): string {
  const matchingValues = annotations
    .filter((annotation) => isMatchingStepAnnotation(annotation, context))
    .map((annotation) => normalizeEditorStepValue(annotation.sniptaleStepValue, context))
    .filter((value) => value.length > 0);

  if (matchingValues.length === 0) {
    return getDefaultEditorStepValue(context);
  }

  if (context.type === 'number') {
    const current = matchingValues.reduce((maxValue, value) => {
      const numericValue = Number.parseInt(value, 10) || 0;
      return Math.max(maxValue, numericValue);
    }, 0);

    return getNextEditorStepValue({
      ...context,
      value: String(current),
    });
  }

  if (context.type === 'manual') {
    return matchingValues[matchingValues.length - 1] ?? getDefaultEditorStepValue(context);
  }

  const alphabet = getAlphabetLetters(context.alphabet);
  const current = matchingValues.reduce(
    (bestValue, value) => {
      const bestIndex = alphabet.indexOf(bestValue);
      const valueIndex = alphabet.indexOf(value);
      return valueIndex > bestIndex ? value : bestValue;
    },
    matchingValues[0] ?? getDefaultEditorStepValue(context)
  );

  return getNextEditorStepValue({
    ...context,
    value: current,
  });
}
