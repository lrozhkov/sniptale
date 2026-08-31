import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = 'tooling/configs/ci/dependency-freshness.json';
const POLICY_PATH = 'tooling/configs/ci/github-policy.json';
const TOOLCHAIN_PATH = 'tooling/configs/ci/toolchain.lock.json';
const RUNNER_PATH = 'tooling/configs/ci/selectel-runner.json';
const SHA_PIN = /^[a-f0-9]{40}$/u;

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function discoverFiles(root, relativeDirectory, predicate) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs
    .readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return discoverFiles(root, relativePath, predicate);
      return entry.isFile() && predicate(relativePath) ? [relativePath] : [];
    })
    .sort();
}

function discoverNpmLockRoots(root) {
  function visit(relativeDirectory) {
    return fs
      .readdirSync(path.join(root, relativeDirectory || '.'), { withFileTypes: true })
      .flatMap((entry) => {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
          if (['.git', '.tmp', 'node_modules'].includes(entry.name)) return [];
          return visit(relativePath);
        }
        return entry.isFile() && entry.name === 'package-lock.json' ? [relativePath] : [];
      });
  }
  return visit('').sort();
}

function parseActionPins(root) {
  const pins = new Map();
  const actionFiles = [
    ...discoverFiles(root, '.github/workflows', (file) => /\.ya?ml$/u.test(file)),
    ...discoverFiles(root, '.github/actions', (file) => /\.ya?ml$/u.test(file)),
  ].sort();
  for (const file of actionFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const sourceLine of source.split('\n')) {
      let line = sourceLine.trimStart();
      if (line.startsWith('-')) line = line.slice(1).trimStart();
      if (!line.startsWith('uses:')) continue;
      const [referencePart, commentPart = ''] = line.slice('uses:'.length).split('#', 2);
      const reference = referencePart.trim().split(/\s/u, 1)[0];
      const declaredVersion = commentPart.trim().split(/\s/u, 1)[0] || null;
      if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
      const separator = reference.lastIndexOf('@');
      if (separator < 1) throw new Error(`External Action is not pinned: ${file}: ${reference}`);
      const action = reference.slice(0, separator);
      const commit = reference.slice(separator + 1);
      if (!SHA_PIN.test(commit)) {
        throw new Error(`External Action must use a full commit SHA: ${file}: ${reference}`);
      }
      const existing = pins.get(action);
      if (existing && existing.commit !== commit) {
        throw new Error(`External Action has multiple pinned commits: ${action}`);
      }
      pins.set(action, {
        action,
        commit,
        declaredVersion,
        refreshUrl: `https://github.com/${action.split('/').slice(0, 2).join('/')}/releases`,
      });
    }
  }
  return [...pins.values()].sort((left, right) => left.action.localeCompare(right.action));
}

function assertSelectedActionPolicy(actionPins, policy) {
  if (
    policy.actions.allowed_actions !== 'selected' ||
    policy.actions.sha_pinning_required !== true ||
    policy.actions.selected.github_owned_allowed !== true ||
    policy.actions.selected.verified_allowed !== false
  ) {
    throw new Error('GitHub Action policy must retain selected Actions with full SHA pinning.');
  }
  const usedThirdParty = actionPins
    .filter(({ action }) => !action.startsWith('actions/') && !action.startsWith('github/'))
    .map(({ action, commit }) => `${action}@${commit}`)
    .sort();
  const allowedThirdParty = [...policy.actions.selected.patterns_allowed].sort();
  if (JSON.stringify(usedThirdParty) !== JSON.stringify(allowedThirdParty)) {
    throw new Error('External Action pins and the selected-Action allowlist are out of sync.');
  }
}

function resolveFragment(value, fragment) {
  return fragment.split('.').reduce((current, key) => current?.[key], value);
}

function readAuthority(root, authority, cachedJson) {
  const [file, fragment] = authority.owner.split('#');
  const value = fragment ? resolveFragment(cachedJson.get(file), fragment) : null;
  const bytes = fs.readFileSync(path.join(root, file));
  if (fragment && (value === undefined || value === null)) {
    throw new Error(`Freshness authority is missing: ${authority.owner}`);
  }
  return {
    ...authority,
    current: fragment ? value : { sha256: sha256(bytes) },
  };
}

function rootDependencies(lock) {
  const rootPackage = lock.packages?.[''] ?? {};
  const names = new Set([
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...Object.keys(rootPackage.devDependencies ?? {}),
    ...Object.keys(rootPackage.optionalDependencies ?? {}),
  ]);
  return [...names].sort().map((name) => {
    const installed = lock.packages?.[`node_modules/${name}`];
    return { name, upstreamName: installed?.name ?? name, current: installed?.version ?? null };
  });
}

function githubReleaseAuthority(value) {
  const match = value?.url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\//u);
  if (!match || typeof value?.version !== 'string') return null;
  return {
    endpoint: `https://api.github.com/repos/${match[1]}/releases/latest`,
    current: value.version,
    selectLatest: (payload) => String(payload.tag_name ?? '').replace(/^codeql-bundle-v|^v/u, ''),
  };
}

async function probeVersion({ current, endpoint, headers, selectLatest }, fetchImpl) {
  try {
    const response = await fetchImpl(endpoint, headers ? { headers } : undefined);
    if (!response.ok) return { status: 'check-failed', detail: `HTTP ${response.status}` };
    const latest = selectLatest(await response.json());
    if (!latest) return { status: 'check-failed', detail: 'upstream version is missing' };
    return { status: latest === current ? 'current' : 'update-available', current, latest };
  } catch (error) {
    return {
      status: 'check-failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function createDependencyFreshnessReport(
  root = process.cwd(),
  { fetchImpl = globalThis.fetch } = {}
) {
  const plan = createDependencyRefreshPlan(root);
  if (typeof fetchImpl !== 'function') throw new Error('Dependency freshness requires fetch.');

  const npmLockRoots = await Promise.all(
    plan.npmLockRoots.map(async (lockRoot) => ({
      ...lockRoot,
      dependencies: await Promise.all(
        lockRoot.dependencies.map(async ({ name, upstreamName, current }) => {
          if (!current) return { name, upstreamName, current, status: 'upstream-unverifiable' };
          return {
            name,
            upstreamName,
            ...(await probeVersion(
              {
                current,
                endpoint: `https://registry.npmjs.org/${encodeURIComponent(upstreamName)}/latest`,
                selectLatest: (payload) => String(payload.version ?? ''),
              },
              fetchImpl
            )),
          };
        })
      ),
    }))
  );
  const actionPins = await Promise.all(
    plan.actionPins.map(async (pin) => {
      if (!pin.declaredVersion) return { ...pin, status: 'upstream-unverifiable' };
      return {
        ...pin,
        ...(await probeVersion(
          {
            current: pin.declaredVersion.replace(/^v/u, ''),
            endpoint: `https://api.github.com/repos/${pin.action.split('/').slice(0, 2).join('/')}/releases/latest`,
            headers: { Accept: 'application/vnd.github+json' },
            selectLatest: (payload) => String(payload.tag_name ?? '').replace(/^v/u, ''),
          },
          fetchImpl
        )),
      };
    })
  );
  const toolchainAuthorities = await Promise.all(
    plan.toolchainAuthorities.map(async (authority) => {
      const upstream = githubReleaseAuthority(authority.current);
      return upstream
        ? {
            ...authority,
            ...(await probeVersion(
              { ...upstream, headers: { Accept: 'application/vnd.github+json' } },
              fetchImpl
            )),
          }
        : { ...authority, status: 'upstream-unverifiable' };
    })
  );
  const report = {
    ...plan,
    artifactKind: 'sniptale-read-only-dependency-freshness-report',
    npmLockRoots,
    actionPins,
    toolchainAuthorities,
  };
  return { ...report, digest: sha256(JSON.stringify(report)) };
}

function assertContainerProjections(root, toolchain) {
  const qaDockerfile = fs.readFileSync(path.join(root, 'tooling/ci/Dockerfile'), 'utf8');
  const controllerDockerfile = fs.readFileSync(
    path.join(root, 'tooling/ci/selectel/Dockerfile.controller'),
    'utf8'
  );
  if (!qaDockerfile.startsWith(`FROM ${toolchain.node.image}\n`)) {
    throw new Error('QA Docker base is not the exact toolchain-lock projection.');
  }
  if (!controllerDockerfile.startsWith(`FROM ${toolchain.openstackController.image}\n`)) {
    throw new Error('Controller Docker base is not the exact toolchain-lock projection.');
  }
  for (const url of [toolchain.debian.archiveUrl, toolchain.debian.securityArchiveUrl]) {
    if (!qaDockerfile.includes(url))
      throw new Error(`Debian snapshot projection is missing: ${url}`);
  }
}

export function createDependencyRefreshPlan(root = process.cwd()) {
  const config = readJson(root, CONFIG_PATH);
  const policy = readJson(root, POLICY_PATH);
  const toolchain = readJson(root, TOOLCHAIN_PATH);
  const runnerPolicy = readJson(root, RUNNER_PATH);
  if (config.schemaVersion !== 1) throw new Error('Unsupported dependency freshness schema.');

  const discoveredLocks = discoverNpmLockRoots(root);
  const configuredLocks = [...config.npmLockRoots].sort();
  if (JSON.stringify(discoveredLocks) !== JSON.stringify(configuredLocks)) {
    throw new Error('npm lock-root inventory drifted; classify every lock root exactly once.');
  }

  const actionPins = parseActionPins(root);
  assertSelectedActionPolicy(actionPins, policy);
  assertContainerProjections(root, toolchain);
  const cachedJson = new Map([
    [TOOLCHAIN_PATH, toolchain],
    [RUNNER_PATH, runnerPolicy],
  ]);
  const toolchainAuthorities = config.toolchainAuthorities.map((authority) =>
    readAuthority(root, authority, cachedJson)
  );
  const npmLockRoots = configuredLocks.map((file) => {
    const lock = readJson(root, file);
    return {
      file,
      lockfileVersion: lock.lockfileVersion,
      rootName: lock.packages?.['']?.name ?? lock.name ?? null,
      sha256: sha256(fs.readFileSync(path.join(root, file))),
      dependencies: rootDependencies(lock),
    };
  });
  const plan = {
    schemaVersion: 1,
    artifactKind: 'sniptale-read-only-dependency-refresh-plan',
    mutationAuthority: 'operator-only',
    npmLockRoots,
    actionPins,
    toolchainAuthorities,
    operatorChecklist: [
      'Review upstream release notes and compatibility before changing any locked identity.',
      'Regenerate each affected lock with its canonical package manager or lock owner.',
      'Update an external Action SHA, version comment and selected-Action allowlist atomically.',
      'Verify download checksums, OCI digests, platforms and lock projections before proof.',
      'Submit dependency changes through the normal QA and reviewed release process.',
    ],
  };
  return { ...plan, digest: sha256(JSON.stringify(plan)) };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await createDependencyFreshnessReport(), null, 2)}\n`);
}
