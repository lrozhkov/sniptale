import { expect, it } from 'vitest';

import {
  getDownscaledAttachmentSize,
  pickSmallestAttachmentCandidate,
  pickValidAttachmentCandidate,
} from './pick';

it('prefers the smallest valid attachment candidate', () => {
  const candidates = [
    {
      blob: new Blob(['a'], { type: 'image/jpeg' }),
      dataUrl: 'a',
      filename: 'step1.jpg',
      mimeType: 'image/jpeg',
      stepId: 'step-1',
      stepNumber: 1,
    },
    {
      blob: new Blob([new Uint8Array(120_000)], { type: 'image/jpeg' }),
      dataUrl: 'b',
      filename: 'step1.jpg',
      mimeType: 'image/jpeg',
      stepId: 'step-1',
      stepNumber: 1,
    },
    {
      blob: new Blob([new Uint8Array(320_000)], { type: 'image/jpeg' }),
      dataUrl: 'c',
      filename: 'step1.jpg',
      mimeType: 'image/jpeg',
      stepId: 'step-1',
      stepNumber: 1,
    },
  ];

  expect(pickValidAttachmentCandidate(candidates)).toMatchObject({
    dataUrl: 'a',
    filename: 'step1.jpg',
  });
});

it('falls back to the smallest candidate when none fit the size cap', () => {
  const candidates = [
    {
      blob: new Blob([new Uint8Array(320_000)], { type: 'image/jpeg' }),
      dataUrl: 'a',
      filename: 'step1.jpg',
      mimeType: 'image/jpeg',
      stepId: 'step-1',
      stepNumber: 1,
    },
    {
      blob: new Blob([new Uint8Array(240_000)], { type: 'image/jpeg' }),
      dataUrl: 'b',
      filename: 'step1.jpg',
      mimeType: 'image/jpeg',
      stepId: 'step-1',
      stepNumber: 1,
    },
  ];

  expect(pickSmallestAttachmentCandidate(candidates)).toMatchObject({
    dataUrl: 'b',
    filename: 'step1.jpg',
  });
});

it('derives the downscaled attachment size from the canonical canvas size', () => {
  expect(getDownscaledAttachmentSize()).toEqual({
    height: 373,
    width: 640,
  });
});
