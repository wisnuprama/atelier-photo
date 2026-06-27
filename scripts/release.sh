#!/usr/bin/env bash
# Bump version, update CHANGELOG.md, commit, tag, and build+push the container.
#
# Usage:
#   ./scripts/release.sh <major|minor|patch>
#   make release BUMP=patch

set -euo pipefail

BUMP="${1:-}"

# --- guard checks -----------------------------------------------------------

if [[ "${BUMP}" != "major" && "${BUMP}" != "minor" && "${BUMP}" != "patch" ]]; then
  echo "Usage: $0 <major|minor|patch>" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "==> Aborting: working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi

if ! command -v podman &>/dev/null; then
  echo "==> Aborting: podman not found on PATH." >&2
  exit 1
fi

# --- version bump -----------------------------------------------------------

echo "==> Bumping ${BUMP} version"
NEW_VERSION="$(pnpm version "${BUMP}" --no-git-tag-version | tr -d 'v')"
TAG="v${NEW_VERSION}"
TODAY="$(date +%Y-%m-%d)"
echo "    ${TAG}"

# --- changelog scaffold -----------------------------------------------------

LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
if [[ -n "${LAST_TAG}" ]]; then
  COMMITS="$(git log "${LAST_TAG}..HEAD" --oneline)"
else
  COMMITS="$(git log --oneline)"
fi

TMPFILE="$(mktemp /tmp/changelog-XXXXXX.md)"
trap 'rm -f "${TMPFILE}"' EXIT

cat > "${TMPFILE}" <<EOF
## [${NEW_VERSION}] - ${TODAY}

### Added

-

### Changed

-

### Fixed

-

<!-- commits since ${LAST_TAG:-beginning} (for reference):
${COMMITS}
-->
EOF

echo "==> Opening editor for changelog entry (save and quit when done)"
"${EDITOR:-vi}" "${TMPFILE}"

# Strip the reference comment block before inserting into CHANGELOG.md
ENTRY="$(sed '/^<!--/,/^-->/d' "${TMPFILE}" | sed '/^[[:space:]]*$/{ /./!d }' | sed -e 's/[[:space:]]*$//')"

if [[ -z "$(echo "${ENTRY}" | tr -d '[:space:]')" ]]; then
  echo "==> Aborting: changelog entry is empty." >&2
  exit 1
fi

# Prepend the new entry before the first "## [" line in CHANGELOG.md
CHANGELOG="CHANGELOG.md"
PREAMBLE="$(awk '/^## \[/{exit} {print}' "${CHANGELOG}")"
BODY="$(awk '/^## \[/{found=1} found{print}' "${CHANGELOG}")"

{
  printf '%s\n' "${PREAMBLE}"
  printf '%s\n\n' "${ENTRY}"
  printf '%s\n' "${BODY}"
} > "${CHANGELOG}.tmp"
mv "${CHANGELOG}.tmp" "${CHANGELOG}"

echo "==> Updated ${CHANGELOG}"

# --- git commit + tag -------------------------------------------------------

git add package.json "${CHANGELOG}"
git commit -m "chore: release ${TAG}"
git tag -a "${TAG}" -m "Release ${TAG}"
echo "==> Committed and tagged ${TAG}"

# --- container build + push -------------------------------------------------

./scripts/build-container.sh "${TAG}"
./scripts/build-container.sh "latest"

# --- done -------------------------------------------------------------------

echo ""
echo "==> Released ${TAG}. Push the commit and tag with:"
echo "    git push && git push origin ${TAG}"
