import { useEffect, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { validateScenarioTemplatePack } from '../../../features/scenario/project/v3/templates';
import type { ScenarioTemplatePackValidationResult } from '../../../features/scenario/project/v3/templates';
import {
  SCENARIO_TEMPLATE_IMPORT_VALIDATION_DELAY_MS,
  SCENARIO_V3_LIMITS,
} from '../../../features/scenario/project/v3/limits';

export function useScenarioTemplateImportState() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioTemplatePackValidationResult | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!text.trim()) {
      setError(null);
      setResult(null);
      return;
    }

    if (text.length > SCENARIO_V3_LIMITS.maxPackJsonLength) {
      setResult(null);
      setError(translate('scenario.editor.invalidTemplateJson'));
      return;
    }

    const validationTimer = window.setTimeout(() => {
      try {
        setError(null);
        setResult(validateScenarioTemplatePack(JSON.parse(text)));
      } catch {
        setError(translate('scenario.editor.invalidTemplateJson'));
        setResult(null);
      }
    }, SCENARIO_TEMPLATE_IMPORT_VALIDATION_DELAY_MS);

    return () => window.clearTimeout(validationTimer);
  }, [text]);

  function validateText(nextText = text) {
    setText(nextText);
    setError(null);
    setResult(null);
  }

  return {
    error,
    result,
    setText,
    text,
    validateText,
  };
}
