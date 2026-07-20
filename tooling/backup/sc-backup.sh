#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/common.sh"
initialize_backup_context "$script_dir"
archive_path="${output_root}/sc_backup_${timestamp}.zip"

mkdir -p "$output_root"

cd "$repo_root"

"$zip_bin" -1 -r "$archive_path" . \
  -x ".backup" ".backup/*" \
  -x ".tmp" ".tmp/*" \
  -x ".hatiqo" ".hatiqo/*" \
  -x ".playwright-browsers" ".playwright-browsers/*" \
  -x "node_modules" "node_modules/*" \
  -x "build" "build/*" \
  -x "dist" "dist/*" \
  -x "coverage" "coverage/*" \
  -x "cases" "cases/*" \
  -x "tasks" "tasks/*" \
  -x "respViewver" "respViewver/*" \
  -x "*.tsbuildinfo" \
  -x ".eslintcache"

echo "Backup ready: ${archive_path}"
