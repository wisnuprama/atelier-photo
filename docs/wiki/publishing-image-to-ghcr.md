# Publishing the container image to GitHub Container Registry

This guide covers building the image locally and pushing it to
`ghcr.io` so it can be pulled on any server without a local build step.

## Prerequisites

- A GitHub Personal Access Token (PAT) with the `write:packages` scope.
  Create one at **GitHub → Settings → Developer settings → Personal access tokens**.
- Podman installed locally.

## 1. Authenticate with ghcr.io

```sh
echo YOUR_GITHUB_PAT | podman login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## 2. Build with the ghcr.io tag

Run this from the project root:

```sh
podman build -t ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest .
```

## 3. Push

```sh
podman push ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest
```

## 4. Make the package public (optional)

By default new packages are private. To make it public:

1. Go to your GitHub profile → **Packages**.
2. Select `atelier-photo`.
3. **Package settings → Change visibility → Public**.

If you keep it private, authenticate on the server before pulling (see step 5).

## 5. Pull and restart on the server

```sh
# Authenticate if the package is private
echo YOUR_GITHUB_PAT | podman login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull the new image
podman pull ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest

# Reload and restart the service
systemctl --user daemon-reload
systemctl --user restart atelier-photo
```

## Updating

Repeat steps 2–3 to push a new image, then pull and restart on the server:

```sh
# Local
podman build -t ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest .
podman push ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest

# Server
podman pull ghcr.io/YOUR_GITHUB_USERNAME/atelier-photo:latest
systemctl --user restart atelier-photo
```

The named volume `atelier-photo-data` is untouched by image updates — your
database and photos are safe.
