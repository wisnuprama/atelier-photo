#!/usr/bin/env bash
# Build and push a multi-arch (linux/amd64 + linux/arm64) manifest to ghcr.io.
#
# Usage:
#   ./scripts/build-container.sh [TAG]
#
# Default TAG is "latest". Requires QEMU/binfmt for cross-arch emulation.
#
# Prerequisites:
#   podman login ghcr.io -u <github-user> -p <PAT>

set -euo pipefail

IMAGE="ghcr.io/wisnuprama/atelier-photo"
TAG="${1:-latest}"
MANIFEST="${IMAGE}:${TAG}"
AMD64="${IMAGE}:${TAG}-amd64"
ARM64="${IMAGE}:${TAG}-arm64"

echo "==> Building linux/amd64  →  ${AMD64}"
podman build \
  --platform linux/amd64 \
  --label "org.opencontainers.image.arch=amd64" \
  -t "${AMD64}" \
  -f Containerfile .

echo "==> Building linux/arm64  →  ${ARM64}"
podman build \
  --platform linux/arm64 \
  --label "org.opencontainers.image.arch=arm64" \
  -t "${ARM64}" \
  -f Containerfile .

echo "==> Creating multi-arch manifest  →  ${MANIFEST}"
podman manifest rm "${MANIFEST}" 2>/dev/null || podman rmi "${MANIFEST}" 2>/dev/null || true
podman manifest create "${MANIFEST}"
podman manifest add "${MANIFEST}" "${AMD64}"
podman manifest add "${MANIFEST}" "${ARM64}"

echo "==> Pushing per-arch images"
podman push "${AMD64}"
podman push "${ARM64}"

echo "==> Pushing manifest ${MANIFEST}"
podman manifest push --all "${MANIFEST}"

echo "==> Done. Pushed ${MANIFEST} (amd64 + arm64)"
