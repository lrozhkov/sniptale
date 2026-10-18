import type { ReviewTextFragment } from '../../review/text-types';
import { createReviewCaptionSettings } from '../../review/text-document';
import type { VideoProject } from '../types/model';
import { projectVideoProjectTextFragment } from './projection';

/** All enabled documents share one placement plan while retaining their own styles and clocks. */
export function videoProjectCaptionInput(project: VideoProject) {
  const entries = (project.textDocuments ?? []).filter((entry) => entry.captions?.enabled);
  const bindings = new Map(
    entries.flatMap((entry) =>
      entry.document.fragments.map(
        (fragment) => [JSON.stringify([entry.id, fragment.id]), entry] as const
      )
    )
  );
  return {
    document: {
      version: 1 as const,
      fragments: entries.flatMap((entry) =>
        entry.document.fragments.map((fragment) => ({
          ...fragment,
          id: JSON.stringify([entry.id, fragment.id]),
          style: fragment.style ?? entry.captions!.style,
        }))
      ),
    },
    settings: { ...createReviewCaptionSettings(), enabled: true },
    segments: [],
    project(fragment: ReviewTextFragment) {
      const entry = bindings.get(fragment.id);
      if (!entry) throw new Error('Caption document binding is unavailable.');
      return projectVideoProjectTextFragment(project, entry, fragment);
    },
  };
}

/** Clean-source export must composite every interval that intersects authored burn-in text. */
export function hasVideoProjectCaptions(
  project: VideoProject,
  range: { start: number; end: number }
): boolean {
  return (project.textDocuments ?? []).some(
    (entry) =>
      entry.captions?.enabled &&
      entry.document.fragments.some(
        (fragment) =>
          fragment.showInVideo &&
          fragment.text.trim() &&
          projectVideoProjectTextFragment(project, entry, fragment).ranges.some(
            (span) => span.start < range.end && range.start < span.end
          )
      )
  );
}
