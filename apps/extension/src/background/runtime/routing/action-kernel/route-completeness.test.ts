import { describe, expect, it } from 'vitest';
import { backgroundIngressContracts } from '../../../../contracts/messaging/contracts/runtime';
import { backgroundRuntimeTypes } from '../../../../contracts/messaging/parsers/supported-types.data';

function collectMissingRuntimeClassifications(args: {
  readonly acceptedTypes: readonly string[];
  readonly classifiedTypes: ReadonlySet<string>;
}): readonly string[] {
  return args.acceptedTypes.filter((messageType) => !args.classifiedTypes.has(messageType)).sort();
}

describe('background runtime route completeness', () => {
  it('classifies every accepted parser contract exactly once', () => {
    const classifiedTypes = new Set(backgroundIngressContracts.map((entry) => entry.type));
    expect(
      collectMissingRuntimeClassifications({
        acceptedTypes: [...backgroundRuntimeTypes],
        classifiedTypes,
      })
    ).toEqual([]);
  });

  it('detects an accepted contract without a descriptor', () => {
    const classifiedTypes = new Set(backgroundIngressContracts.map((entry) => entry.type));
    expect(
      collectMissingRuntimeClassifications({
        acceptedTypes: [...backgroundRuntimeTypes, 'CONTRACT_ONLY_TEST_MESSAGE'],
        classifiedTypes,
      })
    ).toEqual(['CONTRACT_ONLY_TEST_MESSAGE']);
  });
});
