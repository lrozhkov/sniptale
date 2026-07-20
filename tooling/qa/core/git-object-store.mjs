/**
 * Minimal git object/index reader used when sandboxed Node processes cannot spawn `git`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadPackIndexes, readLooseObject, readPackedObject } from './git-packfile-store.mjs';

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function readUtf8FileIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function resolveRef(gitDir, refName) {
  const looseRefPath = path.join(gitDir, refName);
  const looseRef = readUtf8FileIfPresent(looseRefPath);
  if (looseRef !== null) {
    return looseRef.trim();
  }

  const packedRefsPath = path.join(gitDir, 'packed-refs');
  const packedRefs = readUtf8FileIfPresent(packedRefsPath);
  if (packedRefs === null) {
    return null;
  }

  for (const line of packedRefs.split(/\r?\n/u)) {
    if (!line || line.startsWith('#') || line.startsWith('^')) {
      continue;
    }

    const [oid, name] = line.split(' ');
    if (name === refName) {
      return oid;
    }
  }

  return null;
}

export function resolveGitDir(repoRoot) {
  const dotGitPath = path.join(repoRoot, '.git');
  let descriptor;
  try {
    descriptor = fs.openSync(dotGitPath, 'r');
  } catch (error) {
    if (fs.statSync(dotGitPath).isDirectory()) {
      return dotGitPath;
    }
    throw error;
  }

  try {
    if (fs.fstatSync(descriptor).isDirectory()) {
      return dotGitPath;
    }

    const match = fs.readFileSync(descriptor, 'utf8').match(/^gitdir:\s*(.+)\s*$/u);
    if (!match) {
      throw new Error('Unsupported .git indirection format');
    }

    return path.resolve(repoRoot, match[1]);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function hashGitBlob(content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return crypto.createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
}

export function readGitIndexEntries(repoRoot) {
  const gitDir = resolveGitDir(repoRoot);
  const indexPath = path.join(gitDir, 'index');
  const buffer = fs.readFileSync(indexPath);

  if (buffer.subarray(0, 4).toString('ascii') !== 'DIRC') {
    throw new Error('Unsupported git index signature');
  }

  const version = readUInt32(buffer, 4);
  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported git index version ${version}`);
  }

  const entryCount = readUInt32(buffer, 8);
  const entries = [];
  let offset = 12;

  for (let index = 0; index < entryCount; index += 1) {
    const entryStart = offset;
    const oid = buffer.subarray(offset + 40, offset + 60).toString('hex');
    const flags = buffer.readUInt16BE(offset + 60);
    const hasExtendedFlags = (flags & 0x4000) !== 0;
    const pathStart = offset + 62 + (hasExtendedFlags ? 2 : 0);
    const pathEnd = buffer.indexOf(0, pathStart);

    entries.push({
      mode: readUInt32(buffer, offset + 24),
      oid,
      path: buffer.subarray(pathStart, pathEnd).toString('utf8'),
    });

    offset = pathEnd + 1;
    while ((offset - entryStart) % 8 !== 0) {
      offset += 1;
    }
  }

  return entries;
}

export class GitObjectStore {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.gitDir = resolveGitDir(repoRoot);
    this.objectCache = new Map();
    this.packIndexes = loadPackIndexes(this.gitDir);
  }

  getHeadCommitOid() {
    const head = fs.readFileSync(path.join(this.gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      return resolveRef(this.gitDir, head.slice(5));
    }
    return head;
  }

  lookupObject(oid) {
    const cached = this.objectCache.get(oid);
    if (cached) {
      return cached;
    }

    const object =
      readLooseObject(this.gitDir, oid) ??
      readPackedObject(this.packIndexes, oid, (baseOid) => this.lookupObject(baseOid));
    if (!object) {
      throw new Error(`Unable to resolve git object ${oid}`);
    }

    this.objectCache.set(oid, object);
    return object;
  }
}

export function readHeadTreeMap(repoRoot) {
  const store = new GitObjectStore(repoRoot);
  const headCommitOid = store.getHeadCommitOid();
  if (!headCommitOid) {
    return new Map();
  }

  const commitObject = store.lookupObject(headCommitOid);
  const treeLine = commitObject.body.toString('utf8').split('\n', 1)[0];
  const treeOid = treeLine.startsWith('tree ') ? treeLine.slice(5) : null;
  const files = new Map();

  function walkTree(prefix, oid) {
    const treeObject = store.lookupObject(oid);
    let offset = 0;

    while (offset < treeObject.body.length) {
      const modeEnd = treeObject.body.indexOf(0x20, offset);
      const nameEnd = treeObject.body.indexOf(0, modeEnd + 1);
      const mode = treeObject.body.subarray(offset, modeEnd).toString('utf8');
      const name = treeObject.body.subarray(modeEnd + 1, nameEnd).toString('utf8');
      const entryOid = treeObject.body.subarray(nameEnd + 1, nameEnd + 21).toString('hex');
      const filePath = prefix ? `${prefix}/${name}` : name;

      if (mode === '40000') {
        walkTree(filePath, entryOid);
      } else {
        files.set(filePath, { mode, oid: entryOid });
      }

      offset = nameEnd + 21;
    }
  }

  if (treeOid) {
    walkTree('', treeOid);
  }

  return files;
}
