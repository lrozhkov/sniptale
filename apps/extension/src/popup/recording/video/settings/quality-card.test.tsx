import { describe, expect, it } from 'vitest';
import { QualityCard } from './quality-card/view';

describe('quality card facade', () => {
  it('re-exports the owner-local quality card view', () => {
    expect(QualityCard).toBeTypeOf('function');
  });
});
