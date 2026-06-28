#!/usr/bin/env bash
# Sets up a Fedora toolbox container for local development of atelier-photo.
#
# Usage:
#   ./scripts/setup-toolbox.sh            # create + provision
#   ./scripts/setup-toolbox.sh --enter    # create + provision + enter shell
set -euo pipefail

CONTAINER="atelier-photo"
FEDORA_RELEASE="44"
NODE_MAJOR="24"
PNPM_VERSION="10.17.1"

ENTER_AFTER=true
for arg in "$@"; do
  [[ "$arg" == "--enter" ]] && ENTER_AFTER=true
done

# ── 1. Create container if needed ────────────────────────────────────────────

if toolbox list --containers 2>/dev/null | grep -qw "$CONTAINER"; then
  echo "Toolbox '$CONTAINER' already exists — skipping creation."
else
  echo "Creating toolbox '$CONTAINER' (Fedora $FEDORA_RELEASE)…"
  toolbox create --distro fedora --release "$FEDORA_RELEASE" "$CONTAINER"
fi

# ── 2. Provision inside the container ────────────────────────────────────────

echo "Provisioning toolbox '$CONTAINER'…"
toolbox run --container "$CONTAINER" bash -s <<INNER
set -euo pipefail

# ── System packages ──────────────────────────────────────────────────────────

echo "Installing system packages…"
sudo dnf install -y \
  git \
  just \
  make \
  gcc gcc-c++ \
  python3 \
  vips-devel \
  zsh

# ── Node.js $NODE_MAJOR ──────────────────────────────────────────────────────

if command -v node &>/dev/null && node --version | grep -q "^v${NODE_MAJOR}\."; then
  echo "Node.js \$(node --version) already installed."
else
  echo "Installing Node.js $NODE_MAJOR via NodeSource…"
  curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | sudo bash -
  sudo dnf install -y nodejs
fi

# ── pnpm via corepack ────────────────────────────────────────────────────────

echo "Enabling corepack + pnpm $PNPM_VERSION…"
sudo corepack enable
corepack prepare pnpm@$PNPM_VERSION --activate

echo ""
echo "Node:  \$(node --version)"
echo "pnpm:  \$(pnpm --version)"
echo "Done!"
INNER

# ── 3. Summary ───────────────────────────────────────────────────────────────

echo ""
echo "Toolbox '$CONTAINER' is ready."
echo ""
echo "Next steps inside the toolbox:"
echo "  pnpm install"
echo "  pnpm db:migrate"
echo "  pnpm dev"
echo ""
echo "Enter with:  toolbox enter $CONTAINER"

if $ENTER_AFTER; then
  exec toolbox enter "$CONTAINER"
fi
