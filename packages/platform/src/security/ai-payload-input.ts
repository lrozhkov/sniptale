import { redactAiPayloadText } from './ai-payload-privacy';

type SanitizedLlmInput = {
  prompt: string;
  jsonData?: string;
  markdownData?: string;
};

export function sanitizeLlmInput(input: {
  jsonData?: string;
  markdownData?: string;
  prompt: string;
}): SanitizedLlmInput {
  return {
    prompt: redactAiPayloadText(input.prompt),
    ...(input.jsonData === undefined ? {} : { jsonData: redactAiPayloadText(input.jsonData) }),
    ...(input.markdownData === undefined
      ? {}
      : { markdownData: redactAiPayloadText(input.markdownData) }),
  };
}
