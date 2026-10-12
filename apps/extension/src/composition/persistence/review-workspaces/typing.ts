import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { loadQuickEditAdvancedContentState } from '../../../features/video/review/advanced/validation';
import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import type { ReviewDocument, ReviewOperation } from '../../../features/video/review/types';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import type { ReviewTextTypingTarget } from '../../../features/video/review/text-types';
import type { VideoWorkspace, VideoWorkspaceTyping } from './contracts';
import { sameReviewWorkspaceValue } from './history-retention';

/** An immutable write capture belongs to one page-issued field-edit action. */
export interface VideoWorkspaceTypingChange {
  actionId: string;
  target: ReviewTextTypingTarget;
  writeId: string;
  continuation: boolean;
  before: QuickEditAdvancedContent;
  after: QuickEditAdvancedContent;
  at: number;
}

const identity = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

function parseTarget(value: unknown): ReviewTextTypingTarget | null {
  return isRecord(value) &&
    Object.keys(value).length === 3 &&
    value['kind'] === 'text' &&
    value['field'] === 'text' &&
    typeof value['fragmentId'] === 'string' &&
    value['fragmentId'].length > 0 &&
    value['fragmentId'].length <= 256
    ? { kind: 'text', fragmentId: value['fragmentId'], field: 'text' }
    : null;
}

/** Admits the full field capture before any canonical side effect. */
export function parseVideoWorkspaceTypingChange(value: unknown): VideoWorkspaceTypingChange | null {
  if (
    !isRecord(value) ||
    !identity(value['actionId']) ||
    !identity(value['writeId']) ||
    typeof value['continuation'] !== 'boolean' ||
    typeof value['at'] !== 'number' ||
    !Number.isFinite(value['at']) ||
    value['at'] < 0
  )
    return null;
  const target = parseTarget(value['target']);
  const before = loadQuickEditAdvancedContentState(value['before']);
  const after = loadQuickEditAdvancedContentState(value['after']);
  if (!target || !before || !after || !validTypingTransition(before, after, target)) return null;
  return {
    actionId: value['actionId'],
    writeId: value['writeId'],
    continuation: value['continuation'],
    target,
    before,
    after,
    at: value['at'],
  };
}

function validTypingTransition(
  before: QuickEditAdvancedContent,
  after: QuickEditAdvancedContent,
  target: ReviewTextTypingTarget
): boolean {
  const previous = before.text?.fragments.find((fragment) => fragment.id === target.fragmentId);
  const next = after.text?.fragments.find((fragment) => fragment.id === target.fragmentId);
  if (!previous || !next || next.revision <= previous.revision) return false;
  const { words: _words, ...fields } = previous;
  const expected = {
    ...before,
    text: {
      ...before.text,
      fragments: before.text!.fragments.map((fragment) =>
        fragment.id === target.fragmentId
          ? { ...fields, text: next.text, revision: next.revision, alignment: 'manual' }
          : fragment
      ),
    },
  };
  return sameReviewWorkspaceValue(expected, after);
}

/** A marker is accepted only with its fully admitted current and retained tail. */
export function parseVideoWorkspaceTyping(
  value: unknown,
  workspace: VideoWorkspace,
  document: ReviewDocument
): VideoWorkspaceTyping | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !identity(value['actionId']) ||
    !identity(value['writeId']) ||
    workspace.cursor !== workspace.history.length
  )
    return null;
  const target = parseTarget(value['target']);
  if (
    !target ||
    !document.advancedContent.text?.fragments.some((fragment) => fragment.id === target.fragmentId)
  )
    return null;
  const operationId = value['operationId'];
  if (operationId === null) {
    if (workspace.formatVersion !== 2 || workspace.history.length !== 0) return null;
  } else {
    const tail = workspace.history.at(-1);
    if (
      operationId !== value['actionId'] ||
      tail?.id !== operationId ||
      tail.target !== 'advancedContent' ||
      !validTypingTransition(tail.before, tail.after, target)
    )
      return null;
  }
  return { actionId: value['actionId'], writeId: value['writeId'], target, operationId };
}

/** Coalescence is explicit; ordinary operation identities never authorize replacing history. */
export function prepareVideoWorkspaceTyping(
  workspace: VideoWorkspace,
  document: ReviewDocument,
  change: VideoWorkspaceTypingChange
): VideoWorkspace {
  if (
    !validTypingTransition(change.before, change.after, change.target) ||
    !sameReviewWorkspaceValue(change.before, document.advancedContent)
  )
    throw new Error('Typing content changed.');
  const current = workspace.typing;
  if (
    change.continuation &&
    (!current ||
      current.actionId !== change.actionId ||
      !sameReviewWorkspaceValue(current.target, change.target))
  )
    throw new Error('Typing action expired.');
  if (!change.continuation && current?.actionId === change.actionId)
    throw new Error('Typing action already started.');
  const typing: VideoWorkspaceTyping = {
    actionId: change.actionId,
    target: change.target,
    writeId: change.writeId,
    operationId: change.actionId,
  };
  if (change.continuation && current?.operationId === null) {
    const baseline = { ...document, advancedContent: change.after };
    return {
      ...workspace,
      formatVersion: 2,
      baseline,
      history: [],
      cursor: 0,
      advanced: {
        ...change.after,
        ui: workspace.advanced.ui,
        ...(workspace.advanced.recoveryV1 ? { recoveryV1: workspace.advanced.recoveryV1 } : {}),
      },
      typing: { ...typing, operationId: null },
    };
  }
  const tail = change.continuation ? workspace.history.at(-1) : undefined;
  if (tail && tail.target !== 'advancedContent') throw new Error('Typing tail changed.');
  const operation: ReviewOperation = {
    id: change.actionId,
    at: tail?.at ?? change.at,
    target: 'advancedContent',
    before: tail?.target === 'advancedContent' ? tail.before : change.before,
    after: change.after,
  };
  const history = [
    ...workspace.history.slice(0, change.continuation ? workspace.cursor - 1 : workspace.cursor),
    operation,
  ];
  return {
    ...workspace,
    formatVersion: 2,
    baseline: replayReviewHistory([], 0, workspace.source, reviewDocumentBaseline(workspace)),
    history,
    cursor: history.length,
    typing,
  };
}

/** Other authored transitions close the active group; UI-only acknowledgement may preserve it. */
export function withoutVideoWorkspaceTyping(workspace: VideoWorkspace): VideoWorkspace {
  const { typing: _typing, ...rest } = workspace;
  return rest;
}
