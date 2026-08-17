import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assertReleasePublisher, assertReleaseTagRuleset } from './release-tag-policy.mjs';

const ADMISSION_PATH = '.tmp/ci-release-admission.json';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.trim();
}

function api(repository, endpoint) {
  return JSON.parse(run('gh', ['api', `repos/${repository}/${endpoint}`]));
}

function readRemoteTag(repository, tag) {
  const tagRef = api(repository, `git/ref/tags/${tag}`);
  if (tagRef.object?.type !== 'tag') throw new Error('GitHub tag ref is not annotated.');
  const tagObject = api(repository, `git/tags/${tagRef.object.sha}`);
  if (tagObject.verification?.verified !== true) {
    throw new Error(
      `GitHub did not verify tag signature: ${tagObject.verification?.reason ?? 'unknown'}.`
    );
  }
  if (tagObject.object?.type !== 'commit')
    throw new Error('Release tag must point directly to a commit.');
  return { commit: tagObject.object.sha, tagObjectSha: tagRef.object.sha };
}

function assertLiveReleaseTagRuleset(repository, expected) {
  const summary = api(repository, 'rulesets').find(({ name }) => name === expected.name);
  if (!summary) throw new Error('Required immutable release tag ruleset is missing.');
  const ruleset = api(repository, `rulesets/${summary.id}`);
  assertReleaseTagRuleset(ruleset, expected);
}

function assertImmutableReleases(repository) {
  const immutable = api(repository, 'immutable-releases');
  if (immutable.enabled !== true) {
    throw new Error('Repository release immutability must be live before publication.');
  }
}

function assertExpectedCommit(commit) {
  const expectedCommit = process.env.GITHUB_SHA;
  if (!expectedCommit || commit !== expectedCommit) {
    throw new Error(
      `Release tag commit ${commit} does not match workflow commit ${expectedCommit}.`
    );
  }
}

const tag = process.env.GITHUB_REF_NAME ?? process.argv.find((value) => /^v/u.test(value));
const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
const githubPolicy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
const expectedTagRuleset = githubPolicy.releaseTagRuleset;
assertReleasePublisher(
  process.env.GITHUB_ACTOR,
  process.env.GITHUB_TRIGGERING_ACTOR,
  githubPolicy.releasePublisher
);
const recheck = process.argv.includes('--recheck');
if (recheck) {
  const admission = JSON.parse(fs.readFileSync(ADMISSION_PATH, 'utf8'));
  const current = readRemoteTag(repository, admission.tag);
  assertExpectedCommit(current.commit);
  assertLiveReleaseTagRuleset(repository, expectedTagRuleset);
  assertImmutableReleases(repository);
  if (
    current.tagObjectSha !== admission.tagObjectSha ||
    current.commit !== admission.commit ||
    admission.repository !== repository ||
    admission.releasePublisher !== githubPolicy.releasePublisher
  ) {
    throw new Error('Release tag authority changed after admission.');
  }
  process.stdout.write(`Release tag authority rechecked: ${admission.tag}\n`);
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
if (tag !== `v${version}`)
  throw new Error(`Tag ${tag} must exactly match package version v${version}.`);
if (run('git', ['cat-file', '-t', `refs/tags/${tag}`]) !== 'tag') {
  throw new Error('Release tag must be annotated.');
}
const remote = readRemoteTag(repository, tag);
assertExpectedCommit(remote.commit);
assertLiveReleaseTagRuleset(repository, expectedTagRuleset);
assertImmutableReleases(repository);
const localCommit = run('git', ['rev-list', '-n', '1', `refs/tags/${tag}`]);
if (localCommit !== remote.commit) throw new Error('Local and remote release tag commits differ.');
run('git', ['fetch', '--no-tags', 'origin', 'main']);
const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', remote.commit, 'origin/main']);
if (ancestry.status !== 0) throw new Error(`Tagged commit ${remote.commit} is not in origin/main.`);
const admission = {
  schemaVersion: 1,
  repository,
  tag,
  version,
  commit: remote.commit,
  tagObjectSha: remote.tagObjectSha,
  releasePublisher: githubPolicy.releasePublisher,
  verified: true,
};
fs.mkdirSync(path.dirname(ADMISSION_PATH), { recursive: true });
fs.writeFileSync(ADMISSION_PATH, `${JSON.stringify(admission, null, 2)}\n`, {
  flag: 'wx',
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify(admission)}\n`);
