import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeProcessCovs } from '@bcoe/v8-coverage';
import v8CoverageRuntime from '@vitest/coverage-v8';
import { V8CoverageProvider } from '@vitest/coverage-v8/dist/provider.js';

const SUPPORTED_VITEST_VERSION = '4.1.11';
const DEFAULT_CONCURRENCIES = [4, 8, 12];
const PROFILE_FILENAME = 'coverage-profile.json';
const SLOW_FILE_LIMIT = 50;

function roundDuration(value) {
  return Math.round(value * 10) / 10;
}

export function accumulateDuration(current, elapsed) {
  return roundDuration((current ?? 0) + elapsed);
}

export function parseCoverageProfileConcurrencies(
  value = process.env.SNIPTALE_COVERAGE_PROFILE_CONCURRENCIES
) {
  if (value == null || value.trim() === '') return DEFAULT_CONCURRENCIES;
  const parsed = value.split(',').map((entry) => Number(entry.trim()));
  if (
    parsed.length === 0 ||
    parsed.some((entry) => !Number.isInteger(entry) || entry < 1) ||
    new Set(parsed).size !== parsed.length
  ) {
    throw new Error(
      'SNIPTALE_COVERAGE_PROFILE_CONCURRENCIES must contain unique positive integers.'
    );
  }
  return parsed;
}

export function createCoverageMapIdentity(coverageMap) {
  const hash = crypto.createHash('sha256');
  const semanticHash = crypto.createHash('sha256');
  const files = coverageMap.files().sort();
  for (const filename of files) {
    const coverage = coverageMap.fileCoverageFor(filename).toJSON();
    hash.update(filename);
    hash.update('\0');
    hash.update(JSON.stringify(coverage));
    hash.update('\0');
    semanticHash.update(filename);
    semanticHash.update('\0');
    semanticHash.update(
      JSON.stringify({
        ...coverage,
        b: Object.fromEntries(
          Object.entries(coverage.b).map(([id, counts]) => [
            id,
            counts.map((count) => Number(count > 0)),
          ])
        ),
        f: Object.fromEntries(
          Object.entries(coverage.f).map(([id, count]) => [id, Number(count > 0)])
        ),
        s: Object.fromEntries(
          Object.entries(coverage.s).map(([id, count]) => [id, Number(count > 0)])
        ),
      })
    );
    semanticHash.update('\0');
  }
  return {
    digest: hash.digest('hex'),
    files: files.length,
    semanticDigest: semanticHash.digest('hex'),
    summary: coverageMap.getCoverageSummary().toJSON(),
  };
}

export function validateCoverageProfilePasses(passes) {
  const [reference, ...rest] = passes;
  if (!reference) throw new Error('Coverage profiling produced no processing passes.');
  const mismatch = rest.find(
    (pass) =>
      pass.identity.digest !== reference.identity.digest ||
      pass.identity.files !== reference.identity.files ||
      JSON.stringify(pass.identity.summary) !== JSON.stringify(reference.identity.summary)
  );
  if (mismatch) {
    throw new Error(
      `Coverage processing changed output between concurrency=${reference.concurrency} and concurrency=${mismatch.concurrency}.`
    );
  }
  return reference.identity;
}

function resolveInstalledVitestVersion() {
  return new V8CoverageProvider().version;
}

export function assertSupportedVitestVersion(version = resolveInstalledVitestVersion()) {
  if (version !== SUPPORTED_VITEST_VERSION) {
    throw new Error(
      `Coverage profiler requires @vitest/coverage-v8 ${SUPPORTED_VITEST_VERSION}; found ${version}.`
    );
  }
}

export function mergeRawProcessCoverages(processCoverages) {
  const offsets = new Map();
  for (const coverage of processCoverages) {
    for (const script of coverage.result) {
      if (
        !Object.hasOwn(script, 'startOffset') ||
        typeof script.startOffset !== 'number' ||
        !Number.isFinite(script.startOffset) ||
        script.startOffset < 0
      ) {
        throw new Error(`Invalid V8 coverage startOffset for ${script.url}.`);
      }
      const previous = offsets.get(script.url);
      if (previous != null && previous !== script.startOffset) {
        throw new Error(`Conflicting V8 coverage startOffset values for ${script.url}.`);
      }
      offsets.set(script.url, script.startOffset);
    }
  }
  const merged = mergeProcessCovs(processCoverages);
  for (const script of merged.result) {
    const startOffset = offsets.get(script.url);
    if (startOffset == null) {
      throw new Error(`Missing merged V8 coverage startOffset for ${script.url}.`);
    }
    script.startOffset = startOffset;
  }
  return merged;
}

export async function readRawCoverageGroup({
  concurrency,
  filenames,
  onChunk = () => {},
  readFile = fs.promises.readFile,
}) {
  const results = [];
  const sortedFilenames = [...filenames].sort();
  for (let index = 0; index < sortedFilenames.length; index += concurrency) {
    const chunk = sortedFilenames.slice(index, index + concurrency);
    const values = await Promise.all(
      chunk.map(async (filename) => JSON.parse(await readFile(filename, 'utf8')))
    );
    results.push(...values);
    onChunk(chunk.length);
  }
  return results;
}

class BatchedV8CoverageProvider extends V8CoverageProvider {
  async readCoverageFiles({ onFileRead, onFinished, onDebug }) {
    let completed = 0;
    const total = this.pendingPromises.length;
    await Promise.all(this.pendingPromises);
    this.pendingPromises = [];
    for (const [projectName, coveragePerProject] of this.coverageFiles.entries()) {
      for (const [environment, coverageByTestfiles] of Object.entries(coveragePerProject)) {
        const processCoverages = await readRawCoverageGroup({
          concurrency: this.options.processingConcurrency,
          filenames: Object.values(coverageByTestfiles),
          onChunk: (count) => {
            completed += count;
            if (onDebug.enabled) onDebug(`Reading coverage results ${completed}/${total}`);
          },
          readFile: (filename, encoding) =>
            fs.promises.readFile(filename, encoding).catch((error) => {
              throw this.normalizeCoverageFileError(error);
            }),
        });
        onFileRead(this.mergeRawCoverage(processCoverages));
        await onFinished(this.ctx.getProjectByName(projectName), environment);
      }
    }
  }

  mergeRawCoverage(processCoverages) {
    return mergeRawProcessCoverages(processCoverages);
  }
}

class ProfilingV8CoverageProvider extends BatchedV8CoverageProvider {
  initialize(ctx) {
    assertSupportedVitestVersion();
    super.initialize(ctx);
    this.profileStartedAt = performance.now();
    this.concurrencies = parseCoverageProfileConcurrencies();
    this.selectedConcurrency = this.concurrencies.includes(this.options.processingConcurrency)
      ? this.options.processingConcurrency
      : this.concurrencies[0];
    this.passes = [];
    this.activePass = null;
    this.activeStage = null;
  }

  async readCoverageFiles(callbacks) {
    const startedAt = performance.now();
    let mergeMs = 0;
    let coveredConversionMs = 0;
    await super.readCoverageFiles({
      ...callbacks,
      onFileRead: (coverage) => {
        const callbackStartedAt = performance.now();
        callbacks.onFileRead(coverage);
        mergeMs += performance.now() - callbackStartedAt;
      },
      onFinished: async (...args) => {
        const callbackStartedAt = performance.now();
        this.activeStage = 'covered-remap';
        try {
          await callbacks.onFinished(...args);
        } finally {
          coveredConversionMs += performance.now() - callbackStartedAt;
          this.activeStage = null;
        }
      },
    });
    const totalMs = performance.now() - startedAt;
    const rawMergeMs = this.activePass.stages.rawMergeMs ?? 0;
    Object.assign(this.activePass.stages, {
      coveredConversionMs: roundDuration(coveredConversionMs),
      rawReadAndParseMs: roundDuration(
        Math.max(0, totalMs - mergeMs - coveredConversionMs - rawMergeMs)
      ),
      finalAccumulatorMergeMs: roundDuration(mergeMs),
      rawReadMergeAndCoveredConversionMs: roundDuration(totalMs),
    });
  }

  mergeRawCoverage(processCoverages) {
    const startedAt = performance.now();
    try {
      return super.mergeRawCoverage(processCoverages);
    } finally {
      this.activePass.stages.rawMergeMs = accumulateDuration(
        this.activePass.stages.rawMergeMs,
        performance.now() - startedAt
      );
    }
  }

  async getCoverageMapForUncoveredFiles(testedFiles) {
    const startedAt = performance.now();
    this.activeStage = 'uncovered-remap';
    try {
      return await super.getCoverageMapForUncoveredFiles(testedFiles);
    } finally {
      this.activePass.stages.uncoveredConversionMs = roundDuration(performance.now() - startedAt);
      this.activeStage = null;
    }
  }

  async remapCoverage(filename, wrapperLength, result, functions) {
    const startedAt = performance.now();
    try {
      return await super.remapCoverage(filename, wrapperLength, result, functions);
    } finally {
      if (this.activePass && this.activeStage) {
        this.activePass.fileTimings.push({
          durationMs: roundDuration(performance.now() - startedAt),
          file: filename.startsWith('file://') ? fileURLToPath(filename) : filename,
          stage: this.activeStage,
        });
      }
    }
  }

  async generateCoverage(context) {
    const generateStartedAt = performance.now();
    const testExecutionMs = roundDuration(generateStartedAt - this.profileStartedAt);
    let selectedCoverageMap;
    for (const concurrency of this.concurrencies) {
      this.options.processingConcurrency = concurrency;
      this.activePass = {
        concurrency,
        fileTimings: [],
        stages: {},
      };
      const startedAt = performance.now();
      const coverageMap = await super.generateCoverage(context);
      this.activePass.durationMs = roundDuration(performance.now() - startedAt);
      this.activePass.identity = createCoverageMapIdentity(coverageMap);
      this.activePass.slowFiles = this.activePass.fileTimings
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, SLOW_FILE_LIMIT);
      delete this.activePass.fileTimings;
      this.passes.push(this.activePass);
      selectedCoverageMap ??= coverageMap;
      if (concurrency === this.selectedConcurrency) selectedCoverageMap = coverageMap;
    }
    this.options.processingConcurrency = this.selectedConcurrency;
    this.activePass = null;
    this.profile = {
      processingPasses: this.passes,
      schemaVersion: 1,
      selectedConcurrency: this.selectedConcurrency,
      testExecutionMs,
      vitestVersion: SUPPORTED_VITEST_VERSION,
    };
    fs.writeFileSync(
      path.join(this.options.reportsDirectory, 'coverage-profile-processing.json'),
      `${JSON.stringify(this.profile, null, 2)}\n`,
      'utf8'
    );
    this.profile.identity = validateCoverageProfilePasses(this.passes);
    return selectedCoverageMap;
  }

  async generateReports(coverageMap, allTestsRun) {
    const startedAt = performance.now();
    await super.generateReports(coverageMap, allTestsRun);
    this.profile.vitestJsonReportMs = roundDuration(performance.now() - startedAt);
    this.profile.totalProviderLifetimeMs = roundDuration(performance.now() - this.profileStartedAt);
    fs.writeFileSync(
      path.join(this.options.reportsDirectory, PROFILE_FILENAME),
      `${JSON.stringify(this.profile, null, 2)}\n`,
      'utf8'
    );
  }
}

export default {
  ...v8CoverageRuntime,
  async getProvider() {
    assertSupportedVitestVersion();
    return process.env.SNIPTALE_COVERAGE_PROFILE === '1'
      ? new ProfilingV8CoverageProvider()
      : new BatchedV8CoverageProvider();
  },
};
