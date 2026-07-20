import { describe, expect, it } from 'vitest';
import { CounterCard } from './counter-card';

describe('counter card', () => {
  it('exports the counter card component', () => {
    expect(CounterCard).toBeTypeOf('function');
  });
});
