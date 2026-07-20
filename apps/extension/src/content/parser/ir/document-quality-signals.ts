import type {
  ParsedDocument,
  QualitySignal,
  RootSelectionCandidateEvaluation,
} from '@sniptale/runtime-contracts/dom-tree';
import {
  countDuplicatePropertyLabelOverflow,
  measureBooleanPropertyNoise,
} from './quality-metrics';

function findSelectedRootCandidate(
  documentData: ParsedDocument
): RootSelectionCandidateEvaluation | undefined {
  return documentData.meta?.rootSelection?.candidateEvaluations?.find(
    (candidate) => candidate.selected
  );
}

function buildWeakRootSelectionSignal(documentData: ParsedDocument): QualitySignal | null {
  const selectedCandidate = findSelectedRootCandidate(documentData);
  if (!selectedCandidate || selectedCandidate.score >= 120) {
    return null;
  }

  return {
    kind: 'weak-root-selection',
    severity: 'warning',
    summary: `Selected root ${selectedCandidate.selector ?? 'candidate'} scored ${selectedCandidate.score}.`,
    ...(selectedCandidate.selector === undefined
      ? {}
      : { relatedLocators: [selectedCandidate.selector] }),
  };
}

function buildSchemaMismatchSignal(documentData: ParsedDocument): QualitySignal | null {
  const payloads = documentData.meta?.payloadTrace ?? [];
  if (!payloads.some((entry) => entry.schemaTextHint)) {
    return null;
  }

  const candidateEvaluations = documentData.meta?.rootSelection?.candidateEvaluations ?? [];
  const selectedCandidate = candidateEvaluations.find((candidate) => candidate.selected);
  const schemaCandidate = candidateEvaluations.find(
    (candidate) => candidate.source === 'schema-text'
  );

  if (!selectedCandidate || !schemaCandidate) {
    return null;
  }

  if (selectedCandidate.selector === schemaCandidate.selector) {
    return null;
  }

  if (schemaCandidate.score <= selectedCandidate.score + 40) {
    return null;
  }

  return {
    kind: 'schema-dom-mismatch',
    severity: 'warning',
    summary:
      `Schema-guided candidate ${schemaCandidate.selector} outscored ` +
      `selected root ${selectedCandidate.selector}.`,
    relatedLocators: [selectedCandidate.selector, schemaCandidate.selector].filter(
      Boolean
    ) as string[],
  };
}

function buildDuplicateLabelsSignal(documentData: ParsedDocument): QualitySignal | null {
  const duplicateCount = countDuplicatePropertyLabelOverflow(documentData);
  if (duplicateCount === 0) {
    return null;
  }

  return {
    kind: 'duplicate-property-labels',
    severity: 'warning',
    summary: `Detected ${duplicateCount} duplicate property label overflow cases.`,
  };
}

function buildBooleanNoiseSignal(documentData: ParsedDocument): QualitySignal | null {
  const noiseMetrics = measureBooleanPropertyNoise(documentData);
  if (!noiseMetrics.isNoisy) {
    return null;
  }

  return {
    kind: 'boolean-noise',
    severity: 'warning',
    summary: `Detected ${noiseMetrics.booleanFields} boolean-heavy property fields in the selected root.`,
  };
}

function buildFallbackPipelineSignal(documentData: ParsedDocument): QualitySignal | null {
  if (documentData.meta?.profile?.pipelineId !== 'generic-safe-fallback') {
    return null;
  }

  return {
    kind: 'fallback-pipeline-used',
    severity: 'info',
    summary: 'The page was parsed through the generic safe fallback pipeline.',
  };
}

export function buildQualitySignals(documentData: ParsedDocument): QualitySignal[] {
  return [
    buildWeakRootSelectionSignal(documentData),
    buildSchemaMismatchSignal(documentData),
    buildDuplicateLabelsSignal(documentData),
    buildBooleanNoiseSignal(documentData),
    buildFallbackPipelineSignal(documentData),
  ].filter((signal): signal is QualitySignal => signal !== null);
}
