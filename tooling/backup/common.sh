resolve_backup_zip_bin() {
  local fallback_zip_bin="${HOME}/.local/bin/zip"
  if command -v zip >/dev/null 2>&1; then
    command -v zip
    return
  fi
  if [[ -x "$fallback_zip_bin" ]]; then
    echo "$fallback_zip_bin"
    return
  fi

  echo "zip is not installed. Install it first: sudo apt install zip" >&2
  return 1
}

initialize_backup_context() {
  local caller_dir="$1"
  zip_bin="$(resolve_backup_zip_bin)"
  if repo_root="$(git -C "$caller_dir" rev-parse --show-toplevel 2>/dev/null)"; then
    :
  else
    repo_root="$(cd -- "$caller_dir/../.." && pwd)"
  fi
  output_root="${repo_root}/.backup"
  timestamp="$(date '+%Y-%m-%d_%H-%M-%S')"
}
