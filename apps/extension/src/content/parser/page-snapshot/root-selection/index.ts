import type {
  PageProfile,
  RootSelectionCandidateEvaluation,
  RootSelectionTrace,
} from '@sniptale/runtime-contracts/dom-tree';
import { buildGenericRootCandidates, GENERIC_SEMANTIC_ROOT_SELECTORS } from './helpers';
import { isSelectableElement } from './scoring';
import type { RootSelectionCandidate } from './types';

type PreferredRootResolution = {
  element?: HTMLElement;
  selector?: string;
  candidateSelectors: string[];
  trace: RootSelectionTrace;
};

type RootSelectionOptions = {
  liveRoot: ParentNode;
  virtualRoot: HTMLElement;
  schemaTextHint?: string;
};

function toTrace(
  candidateSelectors: string[],
  selectedCandidate?: RootSelectionCandidate,
  candidateEvaluations?: RootSelectionCandidate[]
): RootSelectionTrace {
  const selectedSelector = selectedCandidate?.selector;
  const selectedTagName = selectedCandidate?.element.tagName.toLowerCase();
  const evaluations = candidateEvaluations?.map((candidate, index) => {
    return {
      source: candidate.source,
      selector: candidate.selector,
      score: candidate.score,
      textLength: candidate.textLength,
      linkDensity: candidate.linkDensity,
      reasons: candidate.reasons,
      selected: index === 0,
    } satisfies RootSelectionCandidateEvaluation;
  });

  return {
    candidateSelectors,
    ...(selectedSelector === undefined ? {} : { selectedSelector }),
    ...(selectedTagName === undefined ? {} : { selectedTagName }),
    ...(evaluations === undefined ? {} : { candidateEvaluations: evaluations }),
  };
}

function buildLegacyPreferredCandidate(
  selector: string,
  candidate: HTMLElement
): RootSelectionCandidate {
  return {
    element: candidate,
    linkDensity: 0,
    reasons: ['source:preferred-root'],
    score: candidate.textContent?.trim().length ?? 0,
    selector,
    source: 'preferred-root',
    textLength: candidate.textContent?.trim().length ?? 0,
  };
}

function resolveLegacyPreferredRoot(
  profile: PageProfile,
  liveRoot: ParentNode
): PreferredRootResolution {
  for (const selector of profile.preferredRoots) {
    const candidate = liveRoot.querySelector(selector);
    if (isSelectableElement(candidate, 'preferred-root')) {
      const selectedCandidate = buildLegacyPreferredCandidate(selector, candidate);
      return {
        element: candidate,
        selector,
        candidateSelectors: [...profile.preferredRoots],
        trace: toTrace([...profile.preferredRoots], selectedCandidate, [selectedCandidate]),
      };
    }
  }

  return {
    candidateSelectors: [...profile.preferredRoots],
    trace: toTrace([...profile.preferredRoots]),
  };
}

function resolveGenericPreferredRoot(
  profile: PageProfile,
  virtualRoot: HTMLElement,
  schemaTextHint?: string
): PreferredRootResolution {
  const candidateEvaluations = buildGenericRootCandidates(virtualRoot, profile, schemaTextHint);
  const selectedCandidate = candidateEvaluations[0];
  const candidateSelectors = Array.from(
    new Set([
      ...profile.preferredRoots,
      ...GENERIC_SEMANTIC_ROOT_SELECTORS,
      ...candidateEvaluations.map((candidate) => candidate.selector),
    ])
  );

  return {
    candidateSelectors,
    ...(selectedCandidate?.element === undefined ? {} : { element: selectedCandidate.element }),
    ...(selectedCandidate?.selector === undefined ? {} : { selector: selectedCandidate.selector }),
    trace: toTrace(candidateSelectors, selectedCandidate, candidateEvaluations),
  };
}

export function resolvePreferredRoot(
  profile: PageProfile,
  options: RootSelectionOptions
): PreferredRootResolution {
  if (profile.vendor !== 'generic') {
    return resolveLegacyPreferredRoot(profile, options.liveRoot);
  }

  return resolveGenericPreferredRoot(profile, options.virtualRoot, options.schemaTextHint);
}
