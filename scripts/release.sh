#!/usr/bin/env bash
# Bump version, update CHANGELOG.md, commit, tag, and build+push the container.
#
# Usage:
#   ./scripts/release.sh <major|minor|patch>
#   just release patch

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
  RANGE="${LAST_TAG}..HEAD"
else
  RANGE="HEAD"
fi
COMMITS="$(git log "${RANGE}" --oneline)"

# Derive the GitHub repo URL (https://github.com/owner/repo) from the origin
# remote so changelog entries can link to each commit.
REMOTE_URL="$(git remote get-url origin 2>/dev/null || echo "")"
REPO_URL="$(printf '%s' "${REMOTE_URL}" \
  | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://[^/]*github\.com/#https://github.com/#; s#\.git$##')"
case "${REPO_URL}" in
  https://github.com/*) ;;          # usable
  *) REPO_URL="" ;;                 # non-GitHub remote: skip commit links
esac

# Categorize conventional-commit subjects into keep-a-changelog sections.
#   feat            -> Added
#   fix             -> Fixed
#   perf|refactor|revert -> Changed
#   merges, docs|chore|test|ci|build|style -> dropped
ADDED=""
CHANGED=""
FIXED=""
while IFS= read -r logline; do
  [[ -z "${logline}" ]] && continue
  hash="${logline%% *}"
  subject="${logline#* }"
  case "${subject}" in
    Merge\ *) continue ;;
  esac
  # Split "type(scope): message" -> type / message
  if [[ "${subject}" =~ ^([a-z]+)(\([^\)]*\))?(!)?:\ (.*)$ ]]; then
    type="${BASH_REMATCH[1]}"
    msg="${BASH_REMATCH[4]}"
  else
    type="other"
    msg="${subject}"
  fi
  # Capitalize the first letter of the message.
  msg="$(printf '%s' "${msg:0:1}" | tr '[:lower:]' '[:upper:]')${msg:1}"
  # Append a reference-style commit link (resolved in a block at the bottom of
  # the entry). Only emitted when we have a GitHub remote.
  if [[ -n "${REPO_URL}" ]]; then
    line="- ${msg} ([\`${hash}\`])"
  else
    line="- ${msg}"
  fi
  case "${type}" in
    feat)                  ADDED+="${line}"$'\n' ;;
    fix)                   FIXED+="${line}"$'\n' ;;
    perf|refactor|revert)  CHANGED+="${line}"$'\n' ;;
    docs|chore|test|ci|build|style) ;;  # omit from changelog
    *)                     CHANGED+="${line}"$'\n' ;;
  esac
done <<< "$(git log "${RANGE}" --format='%h %s')"

TMPFILE="$(mktemp /tmp/changelog-XXXXXX.md)"
trap 'rm -f "${TMPFILE}"' EXIT

cat > "${TMPFILE}" <<EOF
## [${NEW_VERSION}] - ${TODAY}

### Added

${ADDED:--}
### Changed

${CHANGED:--}
### Fixed

${FIXED:--}
<!-- commits since ${LAST_TAG:-beginning} (for reference):
${COMMITS}
-->
EOF

echo "==> Opening editor for changelog entry (save and quit when done)"
"${EDITOR:-vi}" "${TMPFILE}"

# Strip the reference comment block, trim trailing whitespace, and squeeze
# repeated blank lines (portable across BSD/GNU sed; `cat -s` handles the
# blank-line collapse). Command substitution drops trailing newlines.
ENTRY="$(sed '/^<!--/,/^-->/d' "${TMPFILE}" | sed -e 's/[[:space:]]*$//' | cat -s)"

if [[ -z "$(echo "${ENTRY}" | tr -d '[:space:]')" ]]; then
  echo "==> Aborting: changelog entry is empty." >&2
  exit 1
fi

# Build reference-style commit-link definitions for every [`hash`] that survived
# editing (deduped, in order of first appearance). Manually grouping several
# hashes onto one line therefore "just works".
LINKS=""
if [[ -n "${REPO_URL}" ]]; then
  HASHES="$(printf '%s\n' "${ENTRY}" \
    | grep -oE '\[`[0-9a-f]{7,40}`\]' \
    | tr -d '[]`' \
    | awk '!seen[$0]++')"
  if [[ -n "${HASHES}" ]]; then
    LINKS="<!-- ${NEW_VERSION} commit links -->"$'\n\n'
    while IFS= read -r h; do
      [[ -z "${h}" ]] && continue
      LINKS+="[\`${h}\`]: ${REPO_URL}/commit/${h}"$'\n'
    done <<< "${HASHES}"
    LINKS="${LINKS%$'\n'}"  # trim trailing newline
  fi
fi

# Prepend the new entry before the first "## [" line in CHANGELOG.md
CHANGELOG="CHANGELOG.md"
PREAMBLE="$(awk '/^## \[/{exit} {print}' "${CHANGELOG}")"
BODY="$(awk '/^## \[/{found=1} found{print}' "${CHANGELOG}")"

{
  printf '%s\n' "${PREAMBLE}"
  printf '%s\n' "${ENTRY}"
  [[ -n "${LINKS}" ]] && printf '\n%s\n' "${LINKS}"
  printf '\n%s\n' "${BODY}"
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
