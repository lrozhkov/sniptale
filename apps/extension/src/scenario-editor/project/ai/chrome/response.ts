import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
  ScenarioAIParseError,
} from '../../../../contracts/ai/scenario';
import { scenarioAiOperationsResponseSchema } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { translate } from '../../../../platform/i18n';

function extractChromeAiJson(content: string): string {
  return content
    .trim()
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '');
}

function isScenarioAIParseErrorCode(value: string): value is ScenarioAIParseError {
  return value === 'invalid-json' || /^invalid-schema:\d+$/u.test(value);
}

function summarizeChromeAiSchemaError(issueCount: number): ScenarioAIParseError {
  const parseError = `invalid-schema:${issueCount}`;
  return isScenarioAIParseErrorCode(parseError) ? parseError : 'invalid-json';
}

export function parseChromeAiScenarioResponse(
  content: string,
  _contractVersion?: ProcessScenarioEditorWithLLMMessage['contractVersion']
): ProcessScenarioEditorWithLLMResponse {
  const cleanedResponse = extractChromeAiJson(content);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(cleanedResponse) as unknown;
  } catch {
    return {
      error: translate('background.runtime.llmUnexpectedResponse'),
      parseError: 'invalid-json',
      success: false,
    };
  }

  return parseChromeAiScenarioV3Response({ parsedJson });
}

function parseChromeAiScenarioV3Response(args: {
  parsedJson: unknown;
}): ProcessScenarioEditorWithLLMResponse {
  const parsedPayload = scenarioAiOperationsResponseSchema.safeParse(args.parsedJson);

  if (!parsedPayload.success) {
    return createChromeAiScenarioParseFailure({
      parseError: summarizeChromeAiSchemaError(parsedPayload.error.issues.length),
    });
  }

  return {
    operations: parsedPayload.data.operations,
    success: true,
  };
}

function createChromeAiScenarioParseFailure(args: {
  parseError: ScenarioAIParseError;
}): ProcessScenarioEditorWithLLMResponse {
  return {
    error: translate('background.runtime.llmUnexpectedResponse'),
    parseError: args.parseError,
    success: false,
  };
}
