import type { z } from 'zod';
import { coerceParsedAnnotationPack, parseAnnotationPackPayload } from './schema';
import { validateVideoAnnotationPack } from './validation';
import type {
  VideoAnnotationPackParseResult,
  VideoAnnotationPackValidationError,
  VideoAnnotationPrimitiveValue,
  VideoAnnotationTemplateControl,
  VideoAnnotationTemplateGroups,
} from './types';

export function parseVideoAnnotationPack(payload: unknown): VideoAnnotationPackParseResult {
  const parsed = parseAnnotationPackPayload(payload);

  if (!parsed.success) {
    return { errors: parsed.error.issues.map(mapZodIssue), ok: false };
  }

  const pack = coerceParsedAnnotationPack(parsed.data);
  const semanticErrors = validateVideoAnnotationPack(pack);
  if (semanticErrors.length > 0) {
    return { errors: semanticErrors, ok: false };
  }

  return { ok: true, pack };
}

export function createEmptyVideoAnnotationTemplateGroups(): VideoAnnotationTemplateGroups {
  return {
    callout: [],
    focus: [],
    intro: [],
    lowerThird: [],
    scene: [],
    title: [],
  };
}

export function createVideoAnnotationControlValues(
  controls: readonly VideoAnnotationTemplateControl[]
): Record<string, VideoAnnotationPrimitiveValue> {
  return Object.fromEntries(controls.map((control) => [control.id, control.defaultValue]));
}

function mapZodIssue(issue: z.core.$ZodIssue): VideoAnnotationPackValidationError {
  return {
    code: issue.code,
    message: issue.message,
    path: issue.path.filter((part): part is number | string => typeof part !== 'symbol'),
  };
}
