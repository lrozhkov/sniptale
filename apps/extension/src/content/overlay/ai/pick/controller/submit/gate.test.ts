import { describe, expect, it } from 'vitest';
import { createAiSubmitRequestGate } from './gate';

describe('ai-pick submit gate', () => {
  it('tracks the current request and ignores finished stale ids', () => {
    const gate = createAiSubmitRequestGate();
    const firstRequestId = gate.begin();
    const secondRequestId = gate.begin();

    expect(gate.isCurrent(firstRequestId)).toBe(false);
    expect(gate.isCurrent(secondRequestId)).toBe(true);
    expect(gate.finish(firstRequestId)).toBe(false);
    expect(gate.finish(secondRequestId)).toBe(true);
    expect(gate.isCurrent(secondRequestId)).toBe(false);
  });

  it('cancels the active request without finishing it later', () => {
    const gate = createAiSubmitRequestGate();
    const requestId = gate.begin();

    gate.cancel();

    expect(gate.isCurrent(requestId)).toBe(false);
    expect(gate.finish(requestId)).toBe(false);
  });
});
