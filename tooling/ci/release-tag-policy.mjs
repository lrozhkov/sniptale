import { isDeepStrictEqual } from 'node:util';

function normalizeRules(rules) {
  return [...(rules ?? [])]
    .map(({ type, parameters }) => (parameters === undefined ? { type } : { type, parameters }))
    .sort((left, right) => left.type.localeCompare(right.type));
}

export function assertReleaseTagRuleset(live, expected) {
  const actualPolicy = {
    name: live?.name,
    target: live?.target,
    enforcement: live?.enforcement,
    bypass_actors: live?.bypass_actors ?? [],
    conditions: live?.conditions,
    rules: normalizeRules(live?.rules),
  };
  const expectedPolicy = {
    ...expected,
    rules: normalizeRules(expected.rules),
  };
  if (!isDeepStrictEqual(actualPolicy, expectedPolicy)) {
    throw new Error('Immutable release tag ruleset drifted from required policy.');
  }
}

export function assertReleasePublisher(actor, triggeringActor, expected) {
  if (actor !== expected || triggeringActor !== expected) {
    throw new Error(
      `Release actor is not authorized: actor=${actor ?? 'missing'}, triggeringActor=${triggeringActor ?? 'missing'}.`
    );
  }
}
