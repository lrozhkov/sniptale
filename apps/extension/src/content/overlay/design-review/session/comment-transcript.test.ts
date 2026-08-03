import { describe, expect, it } from 'vitest';
import { createCommentTranscriptInsertion } from './comment-transcript';

describe('Design Review comment transcript insertion', () => {
  it('ignores unstable interim hypotheses and appends the finalized text without flicker', () => {
    const insertion = createCommentTranscriptInsertion('Before after', 7);

    expect(insertion.apply({ isFinal: false, sequence: 0, text: 'draft' })).toBeNull();
    expect(insertion.apply({ isFinal: false, sequence: 1, text: 'spoken' })).toBeNull();
    expect(insertion.apply({ isFinal: true, sequence: 2, text: 'spoken ' })).toEqual({
      caretPosition: 14,
      value: 'Before spoken after',
    });
  });

  it('keeps final speech and appends later hypotheses without overwriting the original draft', () => {
    const insertion = createCommentTranscriptInsertion('Alpha omega', 6);

    expect(insertion.apply({ isFinal: true, sequence: 1, text: 'one ' })?.value).toBe(
      'Alpha one omega'
    );
    expect(insertion.apply({ isFinal: false, sequence: 2, text: 'two' })).toBeNull();
    expect(insertion.apply({ isFinal: true, sequence: 3, text: 'two ' })?.value).toBe(
      'Alpha one two omega'
    );
  });

  it('adds one separating space after a non-whitespace caret before dictated text', () => {
    const insertion = createCommentTranscriptInsertion('Keep suffix', 4);

    expect(insertion.apply({ isFinal: true, sequence: 0, text: 'this ' })).toEqual({
      caretPosition: 10,
      value: 'Keep this suffix',
    });
  });

  it('ignores replayed or stale recognition sequences', () => {
    const insertion = createCommentTranscriptInsertion('Keep', 4);

    expect(insertion.apply({ isFinal: true, sequence: 3, text: ' this' })?.value).toBe('Keep this');
    expect(insertion.apply({ isFinal: true, sequence: 3, text: 'duplicate' })).toBeNull();
    expect(insertion.apply({ isFinal: true, sequence: 2, text: 'stale' })).toBeNull();
  });
});
