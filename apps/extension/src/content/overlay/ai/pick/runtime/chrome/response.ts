import { parseLlmJsonResponse } from '../../../../../../features/ai/schemas/ai-response';

function extractChromeAiJson(content: string): string {
  return content
    .trim()
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '');
}

export function validateChromeAiJsonResponse(content: string): string {
  const cleanedResponse = extractChromeAiJson(content);
  const validation = parseLlmJsonResponse(cleanedResponse);

  if (!validation.success) {
    throw new Error(validation.error);
  }

  return cleanedResponse;
}
