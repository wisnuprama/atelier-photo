registry := "ghcr.io/wisnuprama/atelier-photo"
version  := `node -p "require('./package.json').version"`

# Install deps and run DB migrations (auto-provisions toolbox on supported systems)
setup:
    if command -v toolbox > /dev/null 2>&1; then ./scripts/setup-toolbox.sh; fi
    pnpm install --frozen-lockfile
    pnpm db:migrate

# Compile server TS + Tailwind CSS + client JS
build:
    pnpm build

# Run local dev server with hot reload (no container)
dev:
    pnpm dev

# Build single-arch local image and run it against your data/ dir
dev-container:
    podman build -t {{registry}}:dev -f Containerfile .
    podman run --rm -it \
      --name atelier-dev \
      -p 3000:3000 \
      --env-file .env \
      -v "$PWD/data:/app/data:Z" \
      {{registry}}:dev

# Build + push multi-arch image to ghcr.io  [tag=v0.3.0]
image tag="latest":
    ./scripts/build-container.sh {{tag}}

# Bump version, update changelog, commit, tag, build+push  [bump=patch|minor|major]
release bump:
    ./scripts/release.sh {{bump}}
