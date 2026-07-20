import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { parseAiEditResponseJson } from './edit-response';

export function parseAIResponseJSON(
  response: string,
  _originalTree: ParsedDOMTree
): ReturnType<typeof parseAiEditResponseJson> {
  return parseAiEditResponseJson(response);
}
