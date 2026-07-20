import { expect, it } from 'vitest';
import type { LinePathInstance } from '../types';
import { readLineSettings } from './read';

it('aggregates line settings roles without requiring legacy direct metadata', () => {
  const settings = readLineSettings({} as unknown as LinePathInstance);

  expect(settings).toMatchObject({
    color: '#111827',
    fillMode: 'none',
    shadowAngle: 90,
    shadowColor: '#111827',
    width: 3,
  });
});
