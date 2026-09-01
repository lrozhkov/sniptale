import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { collectProductTestInventory } from './product-test-inventory.mjs';

const PROFILE_SCHEMA_VERSION = 1;

function toWorkspacePath(moduleId, workspaceRoot) {
  const relativePath = path.relative(workspaceRoot, moduleId).replaceAll(path.sep, '/');
  return relativePath.startsWith('../') ? moduleId : relativePath;
}

export function serializeNodeModuleProfile(testModule, events, workspaceRoot) {
  const diagnostic = testModule.diagnostic();
  const importDurations = Object.entries(diagnostic.importDurations)
    .map(([moduleId, duration]) => ({
      moduleId: toWorkspacePath(moduleId, workspaceRoot),
      ...duration,
      ...(duration.importer ? { importer: toWorkspacePath(duration.importer, workspaceRoot) } : {}),
    }))
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId));

  return {
    file: toWorkspacePath(testModule.moduleId, workspaceRoot),
    state: testModule.state(),
    testCaseCount: [...testModule.children.allTests()].length,
    timing: {
      collectMs: diagnostic.collectDuration,
      environmentSetupMs: diagnostic.environmentSetupDuration,
      prepareMs: diagnostic.prepareDuration,
      setupMs: diagnostic.setupDuration,
      testsAndHooksMs: diagnostic.duration,
      queuedAtMs: events.queuedAtMs,
      collectedAtMs: events.collectedAtMs,
      startedAtMs: events.startedAtMs,
      endedAtMs: events.endedAtMs,
    },
    importDurations,
  };
}

export default class NodeFragmentationReporter {
  constructor() {
    this.events = new Map();
    this.runStartedAtMs = null;
  }

  onInit(vitest) {
    this.workspaceRoot = vitest.config.root;
    this.outputPath = process.env.SNIPTALE_NODE_FRAGMENTATION_PROFILE;
    if (!this.outputPath) {
      throw new Error('SNIPTALE_NODE_FRAGMENTATION_PROFILE is required by the node profiler.');
    }
    const inventory = collectProductTestInventory({ cwd: this.workspaceRoot });
    this.nodeFiles = new Set(inventory.nodeFiles);
    this.inventoryIdentity = inventory.identities.node;
  }

  onTestRunStart() {
    this.runStartedAtMs = performance.now();
  }

  record(moduleId, field) {
    const file = toWorkspacePath(moduleId, this.workspaceRoot);
    const events = this.events.get(file) ?? {};
    events[field] = performance.now();
    this.events.set(file, events);
  }

  onTestModuleQueued(testModule) {
    this.record(testModule.moduleId, 'queuedAtMs');
  }

  onTestModuleCollected(testModule) {
    this.record(testModule.moduleId, 'collectedAtMs');
  }

  onTestModuleStart(testModule) {
    this.record(testModule.moduleId, 'startedAtMs');
  }

  onTestModuleEnd(testModule) {
    this.record(testModule.moduleId, 'endedAtMs');
  }

  onTestRunEnd(testModules, unhandledErrors, reason) {
    const runEndedAtMs = performance.now();
    const modules = testModules
      .filter((testModule) =>
        this.nodeFiles.has(toWorkspacePath(testModule.moduleId, this.workspaceRoot))
      )
      .map((testModule) =>
        serializeNodeModuleProfile(
          testModule,
          this.events.get(toWorkspacePath(testModule.moduleId, this.workspaceRoot)) ?? {},
          this.workspaceRoot
        )
      )
      .sort((left, right) => left.file.localeCompare(right.file));
    const profile = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      inventory: this.inventoryIdentity,
      run: {
        durationMs: runEndedAtMs - this.runStartedAtMs,
        reason,
        unhandledErrorCount: unhandledErrors.length,
      },
      modules,
    };
    const absoluteOutputPath = path.resolve(this.workspaceRoot, this.outputPath);
    fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
    fs.writeFileSync(absoluteOutputPath, `${JSON.stringify(profile, null, 2)}\n`);
  }
}
