#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/common.sh"
initialize_backup_context "$script_dir"
archive_path="${output_root}/sc_prod_backup_${timestamp}.zip"
file_list="$(mktemp "${TMPDIR:-/tmp}/sc_prod_backup_files.XXXXXX")"

cleanup() {
  rm -f "$file_list"
}
trap cleanup EXIT

mkdir -p "$output_root"

cd "$repo_root"

{
  find . -maxdepth 1 -type f ! -name '*.md' -printf '%P\n'
  find src public tooling/release tooling/configs \
    \( -path 'src/vendor' -o -path '*/generated' -o -path '*/__generated__' \
      -o -path '*/test-support' -o -path '*/fixtures' -o -path '*/__fixtures__' \
      -o -path 'tooling/test' -o -path '.backup' -o -path '.tmp' \) -prune \
    -o -type f \
    ! -name '*.test.*' \
    ! -name '*.spec.*' \
    ! -name '*.test-support.*' \
    ! -name '*.test-helpers.*' \
    ! -name 'test-support.*' \
    ! -name 'test-helpers.*' \
    ! -name 'fixtures.*' \
    ! -name 'fixture.*' \
    ! -name 'fixtures-*' \
    ! -name 'fixture-*' \
    ! -name '*-fixtures.*' \
    ! -name '*-fixture.*' \
    ! -name '*.fixtures.*' \
    ! -name '*.test.fixtures.*' \
    ! -name '*.test.helpers.*' \
    -print
} | sort > "$file_list"

"$zip_bin" -1 -q "$archive_path" -@ < "$file_list"

echo "Backup ready: ${archive_path}"
