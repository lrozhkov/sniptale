import type { AnnotationTemplateSource } from '@sniptale/runtime-contracts/highlighter/border-preset';

type AnnotationTemplateSources = {
  callout: AnnotationTemplateSource;
  stepBadge: AnnotationTemplateSource;
};

const DEFAULT_SOURCES: AnnotationTemplateSources = {
  callout: 'frame-default',
  stepBadge: 'frame-default',
};

// policyStateIds: [] - session-local annotation template preferences grant no capability or authorization.
let sources = DEFAULT_SOURCES;
const listeners = new Set<() => void>();

export function getAnnotationTemplateSources(): AnnotationTemplateSources {
  return sources;
}

export function subscribeAnnotationTemplateSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAnnotationTemplateSource(
  kind: keyof AnnotationTemplateSources,
  source: AnnotationTemplateSource
): void {
  if (sources[kind] === source) return;
  sources = { ...sources, [kind]: source };
  listeners.forEach((listener) => listener());
}

export function resetAnnotationTemplateSources(): void {
  if (sources === DEFAULT_SOURCES) return;
  sources = DEFAULT_SOURCES;
  listeners.forEach((listener) => listener());
}
