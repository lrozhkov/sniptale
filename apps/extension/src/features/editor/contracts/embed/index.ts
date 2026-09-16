import type { EditorDocument } from '../../document/types';
import { isEditorDocument } from '../../document/guards';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isEditorBootstrapPayload, type EditorBootstrapPayload } from '../bootstrap';

export type EditorEmbedMode = 'scenario';
const EDITOR_EMBED_QUERY_PARAM = 'embed';
const EDITOR_EMBED_MESSAGE_SOURCE = 'sniptale-editor-embed';
export const EDITOR_EMBED_SESSION_QUERY_PARAM = 'embedSession';
interface EmbedIdentity {
  source: typeof EDITOR_EMBED_MESSAGE_SOURCE;
  sessionId: string;
}
export interface ScenarioEditorEmbedApplyMessage extends EmbedIdentity {
  type: 'scenario-apply';
  dataUrl: string;
  document: EditorDocument;
}
export interface ScenarioEditorEmbedCloseMessage extends EmbedIdentity {
  type: 'scenario-close';
}
export interface ScenarioEditorEmbedReadyMessage extends EmbedIdentity {
  type: 'scenario-ready';
}
export interface ScenarioEditorEmbedErrorMessage extends EmbedIdentity {
  type: 'scenario-error';
  code: 'load-failed';
}
export interface ScenarioEditorEmbedInitMessage extends EmbedIdentity {
  type: 'scenario-init';
  payload: EditorBootstrapPayload;
}
export type EditorEmbedMessage =
  | ScenarioEditorEmbedApplyMessage
  | ScenarioEditorEmbedCloseMessage
  | ScenarioEditorEmbedReadyMessage
  | ScenarioEditorEmbedErrorMessage;
function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}
export function readEditorEmbedMode(search: string): EditorEmbedMode | null {
  return new URLSearchParams(search).get(EDITOR_EMBED_QUERY_PARAM) === 'scenario'
    ? 'scenario'
    : null;
}
/** Binds one disposable parent/iframe editing session; it is never a durable project identity. */
export function readEditorEmbedSession(search: string): string | null {
  const id = new URLSearchParams(search).get(EDITOR_EMBED_SESSION_QUERY_PARAM);
  return isSessionId(id) ? id : null;
}
export function appendEditorEmbedMode(url: URL, embedMode?: EditorEmbedMode | null): URL {
  if (embedMode) url.searchParams.set(EDITOR_EMBED_QUERY_PARAM, embedMode);
  return url;
}
export function createScenarioEditorEmbedApplyMessage(
  dataUrl: string,
  document: EditorDocument,
  sessionId: string
): ScenarioEditorEmbedApplyMessage {
  return {
    source: EDITOR_EMBED_MESSAGE_SOURCE,
    type: 'scenario-apply',
    sessionId,
    dataUrl,
    document,
  };
}
export function createScenarioEditorEmbedCloseMessage(
  sessionId: string
): ScenarioEditorEmbedCloseMessage {
  return { source: EDITOR_EMBED_MESSAGE_SOURCE, type: 'scenario-close', sessionId };
}
export function createScenarioEditorEmbedReadyMessage(
  sessionId: string
): ScenarioEditorEmbedReadyMessage {
  return { source: EDITOR_EMBED_MESSAGE_SOURCE, type: 'scenario-ready', sessionId };
}
export function createScenarioEditorEmbedInitMessage(
  sessionId: string,
  payload: EditorBootstrapPayload
): ScenarioEditorEmbedInitMessage {
  return { source: EDITOR_EMBED_MESSAGE_SOURCE, type: 'scenario-init', sessionId, payload };
}
export function createScenarioEditorEmbedErrorMessage(
  sessionId: string
): ScenarioEditorEmbedErrorMessage {
  return {
    source: EDITOR_EMBED_MESSAGE_SOURCE,
    type: 'scenario-error',
    sessionId,
    code: 'load-failed',
  };
}
function hasEmbedIdentity(value: unknown): value is Record<string, unknown> & EmbedIdentity {
  return (
    isRecord(value) &&
    value['source'] === EDITOR_EMBED_MESSAGE_SOURCE &&
    isSessionId(value['sessionId'])
  );
}
/** Admits child responses as bounded values; the receiver separately proves origin and WindowProxy. */
export function isEditorEmbedMessage(value: unknown): value is EditorEmbedMessage {
  if (!hasEmbedIdentity(value)) return false;
  if (value['type'] === 'scenario-close' || value['type'] === 'scenario-ready') return true;
  if (value['type'] === 'scenario-error') return value['code'] === 'load-failed';
  return (
    value['type'] === 'scenario-apply' &&
    isImageDataUrl(value['dataUrl']) &&
    isEditorDocument(value['document'])
  );
}
/** Admits the parent initialization payload without granting sender authority. */
export function isEditorEmbedInitMessage(value: unknown): value is ScenarioEditorEmbedInitMessage {
  return (
    hasEmbedIdentity(value) &&
    value['type'] === 'scenario-init' &&
    isEditorBootstrapPayload(value['payload'])
  );
}
