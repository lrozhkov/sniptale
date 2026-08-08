import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddFrameCommentIcon, FrameCommentIcon } from './icons';

describe('frame annotation comment iconography', () => {
  it.each([
    [FrameCommentIcon, 'lucide-message-square-text'],
    [AddFrameCommentIcon, 'lucide-message-square-plus'],
  ] as const)('distinguishes the primary comment from adding another', (Icon, className) => {
    expect(renderToStaticMarkup(<Icon />)).toContain(className);
  });
});
