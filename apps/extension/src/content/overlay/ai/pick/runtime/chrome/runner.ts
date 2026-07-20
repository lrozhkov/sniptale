import {
  createChromeAiSession,
  createChromeAiSystemPromptMessage,
} from '@sniptale/platform/browser/chrome-ai';
import { requestChromeAiContentSystemPrompt } from '../../../../../../workflows/ai-settings/query';
import { assertContentAiPayloadLimits } from '../../../../../../contracts/ai/payload-limits';
import type { AiPrivacyProof } from '../../../../../../features/ai/privacy';
import { prepareChromeContentAiJsonEgress } from '../../../../../../features/ai/content-egress-pipeline';
import { validateChromeAiJsonResponse } from './response';

async function resolveChromeAiContentPrompt(modelId: string): Promise<string> {
  return requestChromeAiContentSystemPrompt(modelId);
}

function buildChromeAiContentRequest(jsonData: string, prompt: string): string {
  return `${jsonData}\n\n### Instruction:\n${prompt}`;
}

export async function runChromeAiContentJsonRequest(args: {
  jsonData: string;
  modelId: string;
  privacyProof: AiPrivacyProof;
  prompt: string;
}): Promise<string> {
  assertContentAiPayloadLimits({ jsonData: args.jsonData, prompt: args.prompt });
  const egress = await prepareChromeContentAiJsonEgress({
    jsonData: args.jsonData,
    privacyProof: args.privacyProof,
    prompt: args.prompt,
  });
  assertContentAiPayloadLimits({ jsonData: egress.jsonData, prompt: egress.prompt });

  const systemPrompt = await resolveChromeAiContentPrompt(args.modelId);
  const session = await createChromeAiSession({
    initialPrompts: createChromeAiSystemPromptMessage(systemPrompt),
  });

  try {
    const rawResponse = await session.prompt(
      buildChromeAiContentRequest(egress.jsonData, egress.prompt)
    );
    return validateChromeAiJsonResponse(rawResponse);
  } finally {
    session.destroy();
  }
}
