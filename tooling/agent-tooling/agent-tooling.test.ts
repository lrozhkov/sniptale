import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  AGENT_TOOLING_PAYLOAD_PATHS,
  installAgentTooling,
  loadAgentToolingArchive,
  packAgentTooling,
  parseAgentToolingCliOptions,
  removeAgentTooling,
} from './agent-tooling.mjs';
import { createTempRoot } from '../qa/test-support/test-helpers';

function createKit() {
  const root = createTempRoot('agent-tooling-');
  const files = new Map(
    AGENT_TOOLING_PAYLOAD_PATHS.map((relativePath) => [relativePath, `# ${relativePath}\n`])
  );
  for (const [relativePath, contents] of files) {
    const destination = path.join(root, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  return {
    archivePath: path.join(root, 'docs/agent-tooling/agent-tooling.zip'),
    files,
    root,
  };
}

function digest(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('optional agent tooling archive', () => {
  it('accepts only the explicit force CLI option', () => {
    expect(parseAgentToolingCliOptions([])).toEqual({ force: false });
    expect(parseAgentToolingCliOptions(['--force'])).toEqual({ force: true });
    expect(() => parseAgentToolingCliOptions(['--unexpected'])).toThrow(
      'Unsupported argument: --unexpected'
    );
  });

  it('packs deterministic exact payload and clears only known legacy files', async () => {
    const { archivePath, files, root } = createKit();
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(path.join(root, 'docs/agent-tooling/README.md'), 'legacy guide\n');
    for (const [relativePath, contents] of files) {
      const legacy = path.join(root, 'docs/agent-tooling', relativePath);
      mkdirSync(path.dirname(legacy), { recursive: true });
      writeFileSync(legacy, contents);
    }

    await packAgentTooling({ archivePath, repositoryRoot: root });
    const firstDigest = digest(archivePath);
    await packAgentTooling({ archivePath, repositoryRoot: root });

    expect(digest(archivePath)).toBe(firstDigest);
    expect(readdirSync(path.dirname(archivePath))).toEqual(['agent-tooling.zip']);
    expect([...loadAgentToolingArchive(archivePath).keys()]).toEqual(AGENT_TOOLING_PAYLOAD_PATHS);
  });

  it('installs and removes exactly the archived payload', async () => {
    const { archivePath, files, root } = createKit();
    await packAgentTooling({ archivePath, repositoryRoot: root });
    const destinationRoot = path.join(root, 'worktree');

    expect(installAgentTooling({ archivePath, destinationRoot })).toEqual(
      AGENT_TOOLING_PAYLOAD_PATHS
    );
    for (const [relativePath, contents] of files) {
      expect(readFileSync(path.join(destinationRoot, relativePath), 'utf8')).toBe(contents);
    }
    const localOnlyFile = path.join(destinationRoot, '.agents/local-notes.md');
    writeFileSync(localOnlyFile, '# Local only\n');
    expect(removeAgentTooling({ archivePath, destinationRoot })).toEqual(
      AGENT_TOOLING_PAYLOAD_PATHS
    );
    expect(readFileSync(localOnlyFile, 'utf8')).toBe('# Local only\n');
  });

  it('protects local modifications unless force is explicit', async () => {
    const { archivePath, root } = createKit();
    await packAgentTooling({ archivePath, repositoryRoot: root });
    const destinationRoot = path.join(root, 'worktree');
    installAgentTooling({ archivePath, destinationRoot });
    writeFileSync(path.join(destinationRoot, 'AGENTS.md'), '# Local override\n');

    expect(() => installAgentTooling({ archivePath, destinationRoot })).toThrow('--force');
    expect(() => removeAgentTooling({ archivePath, destinationRoot })).toThrow('--force');
    removeAgentTooling({ archivePath, destinationRoot, force: true });
  });

  it('rejects unexpected migration data without mutating it', async () => {
    const { archivePath, root } = createKit();
    const unexpected = path.join(root, 'docs/agent-tooling/local-note.txt');
    mkdirSync(path.dirname(unexpected), { recursive: true });
    writeFileSync(unexpected, 'preserve me\n');

    await expect(packAgentTooling({ archivePath, repositoryRoot: root })).rejects.toThrow(
      'unexpected entry'
    );
    expect(readFileSync(unexpected, 'utf8')).toBe('preserve me\n');
    expect(existsSync(archivePath)).toBe(false);
  });

  it('rejects an archive with an extra entry', async () => {
    const { archivePath, root } = createKit();
    mkdirSync(path.dirname(archivePath), { recursive: true });
    const zip = new JSZip();
    for (const relativePath of AGENT_TOOLING_PAYLOAD_PATHS) {
      zip.file(relativePath, readFileSync(path.join(root, relativePath)), { createFolders: false });
    }
    zip.file('.agents/local-notes.md', 'not kit owned', { createFolders: false });
    writeFileSync(archivePath, await zip.generateAsync({ type: 'nodebuffer' }));

    expect(() => loadAgentToolingArchive(archivePath)).toThrow('exact payload');
  });

  it('bounds decompression by the declared entry size', async () => {
    const { archivePath } = createKit();
    mkdirSync(path.dirname(archivePath), { recursive: true });
    const zip = new JSZip();
    for (const relativePath of AGENT_TOOLING_PAYLOAD_PATHS) {
      const contents = relativePath === 'AGENTS.md' ? 'A'.repeat(2 * 1024 * 1024) : relativePath;
      zip.file(relativePath, contents, { createFolders: false });
    }
    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    let centralOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    while (centralOffset >= 0) {
      const nameLength = archive.readUInt16LE(centralOffset + 28);
      const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString();
      if (name === 'AGENTS.md') break;
      centralOffset = archive.indexOf(
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
        centralOffset + 46 + nameLength
      );
    }
    archive.writeUInt32LE(1, centralOffset + 24);
    writeFileSync(archivePath, archive);

    expect(() => loadAgentToolingArchive(archivePath)).toThrow('exceeds its declared size');
  });

  it('rejects an archive path that is a symlink', async () => {
    const kit = createKit();
    await packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root });
    const linkPath = path.join(kit.root, 'linked-agent-tooling.zip');
    symlinkSync(kit.archivePath, linkPath);

    expect(() => loadAgentToolingArchive(linkPath)).toThrow('regular non-symlink file');
  });

  it('rejects symlinked pack parents without touching their targets', async () => {
    const kit = createKit();
    const external = createTempRoot('agent-tooling-external-');
    writeFileSync(path.join(external, 'README.md'), 'preserve\n');
    mkdirSync(path.join(kit.root, 'docs'), { recursive: true });
    symlinkSync(external, path.join(kit.root, 'docs/agent-tooling'), 'dir');

    await expect(
      packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root })
    ).rejects.toThrow('unsafe directory component');
    expect(readFileSync(path.join(external, 'README.md'), 'utf8')).toBe('preserve\n');
  });

  it('rejects symlinked staging parents without touching their targets', async () => {
    const kit = createKit();
    const external = createTempRoot('agent-tooling-staging-external-');
    writeFileSync(path.join(external, 'sentinel.txt'), 'preserve\n');
    symlinkSync(external, path.join(kit.root, '.tmp'), 'dir');

    await expect(
      packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root })
    ).rejects.toThrow('unsafe directory component');
    expect(readFileSync(path.join(external, 'sentinel.txt'), 'utf8')).toBe('preserve\n');
  });

  it('rejects broken relative links in archived Markdown', async () => {
    const kit = createKit();
    writeFileSync(
      path.join(kit.root, '.agents/skills/security-code-review/SKILL.md'),
      '[missing](references/missing.md)\n'
    );

    await expect(
      packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root })
    ).rejects.toThrow('Markdown link is unresolved');
  });

  it('restores the prior archive and legacy files when publication fails', async () => {
    const kit = createKit();
    await packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root });
    const previousDigest = digest(kit.archivePath);
    chmodSync(kit.archivePath, 0o640);
    const legacyPath = path.join(kit.root, 'docs/agent-tooling/AGENTS.md');
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, 'legacy bytes\n', { mode: 0o600 });

    await expect(
      packAgentTooling({
        archivePath: kit.archivePath,
        repositoryRoot: kit.root,
        testHooks: {
          beforePublish: () => {
            throw new Error('injected publication failure');
          },
        },
      })
    ).rejects.toThrow('injected publication failure');

    expect(digest(kit.archivePath)).toBe(previousDigest);
    expect(statSync(kit.archivePath).mode & 0o777).toBe(0o640);
    expect(readFileSync(legacyPath, 'utf8')).toBe('legacy bytes\n');
    expect(statSync(legacyPath).mode & 0o777).toBe(0o600);
  });

  it('reconciles a recognized interrupted staging state', async () => {
    const kit = createKit();
    await packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root });
    const staging = path.join(kit.root, '.tmp/agent-tooling-pack');
    copyFileSync(kit.archivePath, path.join(staging, 'previous.zip'));
    rmSync(kit.archivePath);
    writeFileSync(path.join(staging, 'next.zip'), 'stale');
    const legacyPath = path.join(kit.root, 'docs/agent-tooling/AGENTS.md');
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, 'partial legacy\n');

    await packAgentTooling({ archivePath: kit.archivePath, repositoryRoot: kit.root });

    expect(readdirSync(path.dirname(kit.archivePath))).toEqual(['agent-tooling.zip']);
    expect([...loadAgentToolingArchive(kit.archivePath).keys()]).toEqual(
      AGENT_TOOLING_PAYLOAD_PATHS
    );
  });
});
