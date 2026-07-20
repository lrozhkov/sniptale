// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';

import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';
import { parseLiveDomThroughPipeline } from '../compatibility/live-dom';
import { parseCapturedPage } from '../parse-page';

const profile: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'form',
  pipelineId: 'generic-structured',
  confidence: 0.9,
  matchedSignals: [],
  preferredRoots: ['body'],
};

function appendFormField(): void {
  const group = document.createElement('div');
  group.className = 'form-group';
  const label = document.createElement('label');
  label.textContent = 'Стоимость';
  const input = document.createElement('input');
  input.value = '123321';
  group.append(label, input);
  document.body.append(group);
}

function createSnapshot(): CapturedPageSnapshot {
  return {
    iframeReadiness: { pendingIframes: [], timedOut: false, totalIframes: 0 },
    liveRoot: document.body,
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
    pageUrl: window.location.href,
    pageTitle: document.title,
    pageHostname: window.location.hostname,
    pageProfile: profile,
    payloads: [],
    profileTrace: profile.matchedSignals,
    rootCandidates: ['body'],
    rootSelectionTrace: {
      candidateSelectors: ['body'],
      selectedSelector: 'body',
      selectedTagName: 'body',
    },
  };
}

function summarizeFields(documentData: ParsedDocument) {
  return documentData.structure.flatMap((section) =>
    section.children
      .filter((child) => child.type === 'field')
      .map((field) => ({
        editable: field.editable,
        label: field.label,
        targetAnchorStrategy: field.targetRef?.anchorStrategy,
        value: field.value,
        valueType: field.valueType,
      }))
  );
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
});

it('characterizes equivalent live and captured form parsing before backend extraction', () => {
  document.title = 'Example form';
  window.history.replaceState({}, '', '/form');
  appendFormField();
  const snapshot = createSnapshot();

  const liveDocument = parseLiveDomThroughPipeline({
    pageMetadata: {
      pageHostname: window.location.hostname,
      pageTitle: document.title,
      pageUrl: window.location.href,
    },
    pageProfile: profile,
    parseRoot: document.body,
  });
  const capturedDocument = parseCapturedPage(snapshot);

  expect(summarizeFields(liveDocument)).toEqual(summarizeFields(capturedDocument));
  expect(summarizeFields(liveDocument)).toEqual([
    expect.objectContaining({
      editable: true,
      label: 'Стоимость',
      targetAnchorStrategy: 'sniptale',
      value: '123321',
    }),
  ]);
  expect(liveDocument.meta?.pipelineTrace).toEqual(capturedDocument.meta?.pipelineTrace);
  expect(liveDocument.meta?.rootSelection).toEqual({ candidateSelectors: ['body'] });
  expect(capturedDocument.meta?.rootSelection).toEqual(
    expect.objectContaining({ selectedSelector: 'body', selectedTagName: 'body' })
  );
});
