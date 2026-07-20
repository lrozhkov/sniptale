import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CODE_FILE_PATTERN, IGNORED_ROOT_SEGMENTS } from '../../core/quality.config.mjs';

function getTrackedFiles(rootDir) {
  try {
    const output = execFileSync('git', ['ls-files'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    const files = [];
    const walk = (directory) => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_ROOT_SEGMENTS.has(entry.name)) {
          continue;
        }

        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(rootDir, absolutePath);
        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        if (CODE_FILE_PATTERN.test(entry.name) || /\.(?:md|json|sh)$/u.test(entry.name)) {
          files.push(relativePath);
        }
      }
    };

    walk(rootDir);
    return files.sort();
  }
}

function getScale(fileCount) {
  if (fileCount > 3000) {
    return 'large';
  }

  if (fileCount >= 500) {
    return 'medium';
  }

  return 'small';
}

function getTopDirectories(trackedFiles, topCount) {
  const counts = new Map();
  for (const file of trackedFiles) {
    const [topLevel = '.'] = file.split('/');
    counts.set(topLevel, (counts.get(topLevel) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, topCount)
    .map(([directory, files]) => ({ directory, files }));
}

function readRepoLocalSkills(rootDir) {
  const skillsDir = path.join(rootDir, '.agents', 'skills');
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  return fs
    .readdirSync(skillsDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const absolutePath = path.join(skillsDir, file);
      const text = fs.readFileSync(absolutePath, 'utf8');
      const headingMatch = text.match(/^#\s+(.+)$/mu);
      return {
        path: path.relative(rootDir, absolutePath),
        title: headingMatch?.[1] ?? file,
        lines: text.split('\n').length,
      };
    });
}

export function collectRepositoryProfile(rootDir, topCount) {
  const trackedFiles = getTrackedFiles(rootDir);
  return {
    trackedFiles,
    profile: {
      root: rootDir,
      trackedFileCount: trackedFiles.length,
      scale: getScale(trackedFiles.length),
      topDirectories: getTopDirectories(trackedFiles, topCount),
      repoLocalSkills: readRepoLocalSkills(rootDir),
    },
  };
}
