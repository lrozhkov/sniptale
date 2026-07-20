import { processWithLLM, processWithLLMConfig } from './service';
import type { DOMNode } from '../../../contracts/messaging/llm';
import type { ProcessWithLLMResponse } from '../../../contracts/messaging/llm';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { AiPrivacyProof } from '../../../features/ai/privacy';
import { prepareProviderContentAiEgress } from '../../../features/ai/content-egress-pipeline';
import type { ResolvedLlmModelConfig } from './model-config';
import { parseAiEditResponseJson } from './edit-response';

type ModelConfigSnapshot = ResolvedLlmModelConfig;
type ProcessWithLLMResult = Pick<
  ProcessWithLLMResponse,
  'success' | 'data' | 'changes' | 'parseErrors'
>;

const logger = createLogger({ namespace: 'BackgroundLlmRouter' });

type LlmRequestPayload = {
  prompt: string;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  privacyProof?: AiPrivacyProof | undefined;
};

function createProcessWithLlmResult(args: {
  data: DOMNode[] | undefined;
  changes: ProcessWithLLMResponse['changes'];
  parseErrors: ProcessWithLLMResponse['parseErrors'];
}): ProcessWithLLMResult {
  return {
    success: true,
    ...(args.data !== undefined ? { data: args.data } : {}),
    ...(args.changes !== undefined ? { changes: args.changes } : {}),
    ...(args.parseErrors !== undefined ? { parseErrors: args.parseErrors } : {}),
  };
}

export async function processMultiProviderRequest(
  message: LlmRequestPayload,
  config: ModelConfigSnapshot
): Promise<ProcessWithLLMResult> {
  const prepared = await prepareProviderContentAiEgress(message);
  logger.debug('Processing provider-backed LLM request', {
    hasJsonData: prepared.payloadKind === 'json',
    hasMarkdownData: prepared.payloadKind === 'markdown',
    modelCode: config.modelCode,
    providerId: config.providerId,
    riskClass: prepared.riskClass,
  });

  if (prepared.payloadKind === 'json') {
    return processMultiProviderJson(prepared.request, config);
  }
  if (prepared.payloadKind === 'markdown') {
    return processMultiProviderMarkdown(prepared.request, config);
  }
  throw new Error('Neither jsonData nor markdownData provided');
}

function processMultiProviderJson(
  request: Parameters<typeof processWithLLMConfig>[0],
  config: ModelConfigSnapshot
): Promise<ProcessWithLLMResult> {
  return processWithLLMConfig(request, config, 3).then((result) =>
    createProcessWithLlmJsonResult(result)
  );
}

function createProcessWithLlmJsonResult(result: {
  cleanedResponse?: string | undefined;
  data?: DOMNode[] | undefined;
}): ProcessWithLLMResult {
  if (!result.cleanedResponse) {
    return createProcessWithLlmResult({
      changes: undefined,
      data: result.data,
      parseErrors: undefined,
    });
  }

  const parsed = parseAiEditResponseJson(result.cleanedResponse);
  return createProcessWithLlmResult({
    changes: parsed.changes,
    data: result.data,
    parseErrors: parsed.errors,
  });
}

async function processMultiProviderMarkdown(
  request: Parameters<typeof processWithLLM>[0],
  config: ModelConfigSnapshot
) {
  const result = await processWithLLM(request, config);
  return createProcessWithLlmResult({
    changes: undefined,
    data: result.data,
    parseErrors: undefined,
  });
}
