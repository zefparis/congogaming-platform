#!/usr/bin/env bash
# Install git hooks for congogaming-platform.
# Run after cloning: `bash scripts/setup-hooks.sh`
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="${REPO_ROOT}/.git/hooks/pre-commit"
SRC="${REPO_ROOT}/scripts/pre-commit-gitleaks.sh"

if [ ! -f "${SRC}" ]; then
  echo "[setup-hooks] ERROR: ${SRC} not found — run from repo root." >&2
  exit 1
fi

ln -sf "$(realpath --relative-to="$(dirname "${HOOK}")" "${SRC}")" "${HOOK}"
chmod +x "${SRC}"
echo "[setup-hooks] pre-commit -> ${SRC}"
echo "[setup-hooks] gitleaks will auto-download on first commit if not installed."
