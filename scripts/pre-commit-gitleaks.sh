#!/usr/bin/env bash
# Pre-commit hook: block secrets via gitleaks.
# Auto-downloads gitleaks to ~/.cache/gitleaks on first run.
# CI also enforces this via .github/workflows/gitleaks.yml (full-history scan).
set -euo pipefail

GITLEAKS_VERSION="8.21.2"
CACHE_DIR="${HOME}/.cache/gitleaks"
BIN="${CACHE_DIR}/gitleaks-${GITLEAKS_VERSION}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS="gitleaks"
elif [ -x "${BIN}" ]; then
  GITLEAKS="${BIN}"
else
  echo "[pre-commit] gitleaks not found, downloading v${GITLEAKS_VERSION}..."
  mkdir -p "${CACHE_DIR}"
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "${ARCH}" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "[pre-commit] unsupported arch: ${ARCH}"; exit 1 ;;
  esac
  case "${OS}" in
    darwin|linux) ;;
    *) echo "[pre-commit] unsupported OS: ${OS}"; exit 1 ;;
  esac
  URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${OS}_${ARCH}.tar.gz"
  if ! curl -fsSL "${URL}" | tar -xz -C "${CACHE_DIR}" gitleaks 2>/dev/null; then
    echo "[pre-commit] WARN: could not download gitleaks — skipping local scan."
    echo "[pre-commit] CI will still enforce gitleaks on push/PR."
    exit 0
  fi
  mv "${CACHE_DIR}/gitleaks" "${BIN}"
  chmod +x "${BIN}"
  GITLEAKS="${BIN}"
fi

# Scan staged changes only (fast; full-history scan runs in CI).
cd "${REPO_ROOT}"
if ! "${GITLEAKS}" protect --staged --redact --verbose --no-banner; then
  echo "[pre-commit] BLOCKED: gitleaks detected secrets in staged files."
  echo "[pre-commit] If this is a false positive, add the finding to .gitleaksignore."
  exit 1
fi

exit 0
