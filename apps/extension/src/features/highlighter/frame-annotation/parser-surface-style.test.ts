import { expect, it } from 'vitest';
import { createFrameAnnotationSnapshot, parseFrameAnnotationSnapshot } from '.';
import { createDefaultFrameCallout } from './defaults';

it('normalizes legacy Callout backgroundColor to Solid Paint and rejects malformed Paint', () => {
  const canonicalCallout = createDefaultFrameCallout();
  const { fillPaint: _fillPaint, ...legacySurface } = canonicalCallout.style.surface;
  const callout = {
    ...canonicalCallout,
    style: {
      ...canonicalCallout.style,
      surface: { ...legacySurface, backgroundColor: '#12345680' },
    },
  };
  const snapshot = createFrameAnnotationSnapshot(
    { id: 'legacy-callout-paint', x: 0, y: 0, width: 100, height: 80 },
    0
  );
  const parsed = parseFrameAnnotationSnapshot({ ...snapshot, callout });
  expect(parsed?.callout?.style.surface.fillPaint).toEqual({
    kind: 'solid',
    color: '#12345680',
  });
  expect(
    parseFrameAnnotationSnapshot({
      ...snapshot,
      callout: {
        ...callout,
        style: {
          ...callout.style,
          surface: { ...legacySurface, fillPaint: { kind: 'broken' } },
        },
      },
    })
  ).toBeNull();
});
