import type { CapturedPageSnapshot } from '../../page-snapshot/types';

type CandidateRoot = {
  element: HTMLElement;
  selector?: string;
  rootScore?: number;
  containerSize: number;
  depth: number;
};

function resolvePipelineRoot(
  snapshot: CapturedPageSnapshot,
  rootStrategy: 'live-root' | 'preferred-root' | 'virtual-root'
): HTMLElement {
  if (rootStrategy === 'virtual-root') {
    return snapshot.virtualRoot;
  }

  if (rootStrategy === 'preferred-root') {
    return snapshot.preferredRoot ?? snapshot.virtualRoot;
  }

  return snapshot.liveRoot;
}

function getElementDepth(element: HTMLElement): number {
  let depth = 0;
  let current = element.parentElement;

  while (current) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function buildCandidateRoot(
  element: HTMLElement,
  selector?: string,
  rootScore?: number
): CandidateRoot {
  return {
    element,
    containerSize: element.querySelectorAll('*').length,
    depth: getElementDepth(element),
    ...(selector === undefined ? {} : { selector }),
    ...(rootScore === undefined ? {} : { rootScore }),
  };
}

function resolveSnapshotCandidateBySelector(
  snapshot: CapturedPageSnapshot,
  selector: string
): HTMLElement | null {
  if (snapshot.virtualRoot.matches(selector)) {
    return snapshot.virtualRoot;
  }

  return snapshot.virtualRoot.querySelector<HTMLElement>(selector);
}

function resolveGenericTraceCandidateRoots(snapshot: CapturedPageSnapshot): CandidateRoot[] | null {
  if (
    snapshot.pageProfile.vendor !== 'generic' ||
    !snapshot.rootSelectionTrace.candidateEvaluations ||
    snapshot.rootSelectionTrace.candidateEvaluations.length === 0
  ) {
    return null;
  }

  const seen = new Set<HTMLElement>();
  const candidates: CandidateRoot[] = [];

  snapshot.rootSelectionTrace.candidateEvaluations.forEach((evaluation) => {
    const selector = evaluation.selector;
    const candidate =
      selector && snapshot.virtualRoot.matches(selector)
        ? snapshot.virtualRoot
        : selector
          ? snapshot.virtualRoot.querySelector<HTMLElement>(selector)
          : null;

    if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    candidates.push(buildCandidateRoot(candidate, selector, evaluation.score));
  });

  return candidates.length > 0 ? candidates : null;
}

function getCandidateEvaluationScore(
  snapshot: CapturedPageSnapshot,
  selector?: string
): number | undefined {
  return snapshot.rootSelectionTrace.candidateEvaluations?.find((evaluation) => {
    return evaluation.selector === selector;
  })?.score;
}

function addSelectedCandidate(
  snapshot: CapturedPageSnapshot,
  candidates: CandidateRoot[],
  seen: Set<HTMLElement>
): void {
  const selectedSelector = snapshot.rootSelectionTrace.selectedSelector;

  if (selectedSelector) {
    const selectedCandidate = resolveSnapshotCandidateBySelector(snapshot, selectedSelector);
    if (selectedCandidate instanceof HTMLElement) {
      candidates.push(
        buildCandidateRoot(
          selectedCandidate,
          selectedSelector,
          getCandidateEvaluationScore(snapshot, selectedSelector)
        )
      );
      seen.add(selectedCandidate);
    }
    return;
  }

  if (snapshot.preferredRoot) {
    candidates.push(
      buildCandidateRoot(
        snapshot.virtualRoot,
        selectedSelector,
        getCandidateEvaluationScore(snapshot, selectedSelector)
      )
    );
    seen.add(snapshot.virtualRoot);
  }
}

function addRootCandidateSelectors(
  snapshot: CapturedPageSnapshot,
  candidates: CandidateRoot[],
  seen: Set<HTMLElement>
): void {
  snapshot.rootCandidates.forEach((selector) => {
    const candidate = resolveSnapshotCandidateBySelector(snapshot, selector);
    if (candidate instanceof HTMLElement && !seen.has(candidate)) {
      candidates.push(buildCandidateRoot(candidate, selector));
      seen.add(candidate);
    }
  });
}

function resolvePipelineCandidateRoots(
  snapshot: CapturedPageSnapshot,
  rootStrategy: 'live-root' | 'preferred-root' | 'virtual-root'
): CandidateRoot[] {
  if (rootStrategy !== 'preferred-root') {
    const element = resolvePipelineRoot(snapshot, rootStrategy);
    return [buildCandidateRoot(element)];
  }

  const candidates: CandidateRoot[] = [];
  const seen = new Set<HTMLElement>();
  addSelectedCandidate(snapshot, candidates, seen);
  addRootCandidateSelectors(snapshot, candidates, seen);

  if (candidates.length === 0) {
    candidates.push(buildCandidateRoot(snapshot.virtualRoot));
  }

  return candidates;
}

export function resolveCandidateRoots(
  snapshot: CapturedPageSnapshot,
  rootStrategy: 'live-root' | 'preferred-root' | 'virtual-root'
): CandidateRoot[] {
  return (
    resolveGenericTraceCandidateRoots(snapshot) ??
    resolvePipelineCandidateRoots(snapshot, rootStrategy)
  );
}
