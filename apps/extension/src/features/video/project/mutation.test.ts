import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from './factories/creation';
import {
  applyVideoProjectClipsPatch,
  applyVideoProjectMutationPatch,
  getVideoProjectMutationTimestamp,
} from './mutation';

describe('video project mutation helpers', () => {
  it('returns the current timestamp from the shared helper seam', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    expect(getVideoProjectMutationTimestamp()).toBe(1234);
  });

  it('applies a project patch and refreshes updatedAt through one helper seam', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5678);
    const project = createEmptyVideoProject('Demo');

    expect(
      applyVideoProjectMutationPatch(project, {
        name: 'Updated',
      })
    ).toEqual({
      ...project,
      name: 'Updated',
      updatedAt: 5678,
    });
  });

  it('applies clip-only updates through the narrow clip patch seam', () => {
    vi.spyOn(Date, 'now').mockReturnValue(6789);
    const project = createEmptyVideoProject('Demo');
    const clips = [{ id: 'clip-1' }] as typeof project.clips;

    expect(applyVideoProjectClipsPatch(project, clips)).toEqual({
      ...project,
      clips,
      updatedAt: 6789,
    });
  });
});
