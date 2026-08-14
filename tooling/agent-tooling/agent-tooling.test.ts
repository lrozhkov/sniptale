import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { installAgentTooling, removeAgentTooling } from './agent-tooling.mjs';
import { createTempRoot } from '../qa/core/test-helpers';

function createKit() {
  const root = createTempRoot('agent-tooling-');
  const sourceDirectory = path.join(root, 'docs/agent-tooling');
  const files = new Map([
    ['AGENTS.md', '# Agent rules\n'],
    ['DESIGN.md', '# Product design rules\n'],
    ['.agents/README.md', '# Skills\n'],
    ['.agents/skills/review/SKILL.md', '# Review\n'],
  ]);
  for (const [relativePath, contents] of files) {
    const destination = path.join(sourceDirectory, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  return { files, root, sourceDirectory };
}

describe('optional agent tooling', () => {
  it('installs and removes exactly the tracked kit payload', () => {
    const { files, root, sourceDirectory } = createKit();
    const destinationRoot = path.join(root, 'worktree');

    expect(installAgentTooling({ destinationRoot, sourceDirectory })).toEqual(
      [...files.keys()].sort()
    );
    for (const [relativePath, contents] of files) {
      expect(readFileSync(path.join(destinationRoot, relativePath), 'utf8')).toBe(contents);
    }
    const localOnlyFile = path.join(destinationRoot, '.agents/local-notes.md');
    writeFileSync(localOnlyFile, '# Local only\n');
    expect(removeAgentTooling({ destinationRoot, sourceDirectory })).toEqual(
      [...files.keys()].sort()
    );
    expect(readFileSync(localOnlyFile, 'utf8')).toBe('# Local only\n');
  });

  it('protects local modifications unless force is explicit', () => {
    const { root, sourceDirectory } = createKit();
    const destinationRoot = path.join(root, 'worktree');
    installAgentTooling({ destinationRoot, sourceDirectory });
    writeFileSync(path.join(destinationRoot, 'AGENTS.md'), '# Local override\n');

    expect(() => installAgentTooling({ destinationRoot, sourceDirectory })).toThrow('--force');
    expect(() => removeAgentTooling({ destinationRoot, sourceDirectory })).toThrow('--force');
    removeAgentTooling({ destinationRoot, force: true, sourceDirectory });
  });
});
