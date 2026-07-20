import type { EditorDocument } from '../../document/types';
import { isEditorDocument } from '../../document/guards';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';

export type EditorEmbedMode = 'scenario';

const EDITOR_EMBED_QUERY_PARAM = 'embed';
const SCENARIO_EDITOR_EMBED_MODE = 'scenario';
const EDITOR_EMBED_MESSAGE_SOURCE = 'sniptale-editor-embed';

export interface ScenarioEditorEmbedApplyMessage {
  source: typeof EDITOR_EMBED_MESSAGE_SOURCE;
  type: 'scenario-apply';
  dataUrl: string;
  document: EditorDocument;
}

export interface ScenarioEditorEmbedCloseMessage {
  source: typeof EDITOR_EMBED_MESSAGE_SOURCE;
  type: 'scenario-close';
}

export type EditorEmbedMessage = ScenarioEditorEmbedApplyMessage | ScenarioEditorEmbedCloseMessage;

export function readEditorEmbedMode(search: string): EditorEmbedMode | null {
  const embedMode = new URLSearchParams(search).get(EDITOR_EMBED_QUERY_PARAM);
  return embedMode === SCENARIO_EDITOR_EMBED_MODE ? embedMode : null;
}

export function appendEditorEmbedMode(url: URL, embedMode?: EditorEmbedMode | null): URL {
  if (embedMode) {
    url.searchParams.set(EDITOR_EMBED_QUERY_PARAM, embedMode);
  }

  return url;
}

export function createScenarioEditorEmbedApplyMessage(
  dataUrl: string,
  document: EditorDocument
): ScenarioEditorEmbedApplyMessage {
  return {
    source: EDITOR_EMBED_MESSAGE_SOURCE,
    type: 'scenario-apply',
    dataUrl,
    document,
  };
}

export function createScenarioEditorEmbedCloseMessage(): ScenarioEditorEmbedCloseMessage {
  return {
    source: EDITOR_EMBED_MESSAGE_SOURCE,
    type: 'scenario-close',
  };
}

export function isEditorEmbedMessage(value: unknown): value is EditorEmbedMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    dataUrl?: unknown;
    document?: unknown;
    source?: unknown;
    type?: unknown;
  };

  if (candidate.source !== EDITOR_EMBED_MESSAGE_SOURCE) {
    return false;
  }

  if (candidate.type === 'scenario-close') {
    return true;
  }

  return (
    candidate.type === 'scenario-apply' &&
    isImageDataUrl(candidate.dataUrl) &&
    isEditorDocument(candidate.document)
  );
}
