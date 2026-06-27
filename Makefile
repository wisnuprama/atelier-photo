IMAGE   := ghcr.io/wisnuprama/atelier-photo
VERSION := $(shell node -p "require('./package.json').version")

.DEFAULT_GOAL := help

.PHONY: setup build dev dev-container image release help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS=":.*##"}; {printf "  %-14s %s\n", $$1, $$2}'

setup: ## Install deps and run DB migrations
	pnpm install --frozen-lockfile
	pnpm db:migrate

build: ## Compile server TS + Tailwind CSS + client JS
	pnpm build

dev: ## Run local dev server with hot reload (no container)
	pnpm dev

dev-container: ## Build single-arch local image and run it against your data/ dir
	podman build -t $(IMAGE):dev -f Containerfile .
	podman run --rm -it \
	  --name atelier-dev \
	  -p 3000:3000 \
	  --env-file .env \
	  -v "$(PWD)/data:/app/data:Z" \
	  $(IMAGE):dev

image: ## Build + push multi-arch image to ghcr.io  [TAG=v0.3.0]
	./scripts/build-container.sh $(or $(TAG),latest)

release: ## Bump version, update changelog, commit, tag, build+push  [BUMP=patch|minor|major]
	@test -n "$(BUMP)" || { echo "Usage: make release BUMP=patch|minor|major"; exit 1; }
	./scripts/release.sh $(BUMP)
