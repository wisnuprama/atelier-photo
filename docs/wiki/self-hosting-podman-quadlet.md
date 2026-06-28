# Self-hosting with Podman Quadlet

Quadlet integrates Podman containers with systemd so the gallery starts on boot,
restarts on failure, and is managed with standard `systemctl` commands.

## 1. Get the image

Choose one option. The `Image=` line in the quadlet unit must match whichever
tag you use.

**Option A — pull from GitHub Container Registry:**

```sh
podman pull ghcr.io/wisnuprama/atelier-photo:latest
# quadlet: Image=ghcr.io/wisnuprama/atelier-photo:latest
```

**Option B — build locally** from the source:

```sh
podman build -t localhost/atelier-photo:latest .
# quadlet: Image=localhost/atelier-photo:latest
```

## 2. Create the environment file

Quadlet reads secrets from a file that is never committed. Create it at
`~/.config/atelier-photo/atelier-photo.env`:

```sh
mkdir -p ~/.config/atelier-photo
cat > ~/.config/atelier-photo/atelier-photo.env <<'EOF'
ADMIN_KEY_ID=your-key-id
ADMIN_HMAC_SECRET=your-long-random-secret
EOF
chmod 600 ~/.config/atelier-photo/atelier-photo.env
```

Only the secrets belong in this file. Everything else can be set on the quadlet
unit itself (next section).

## 2b. (Optional) Tune the ingest pipeline

The image ships with defaults sized for a **2 vCPU / 2 GB** host. To run on
different resources, override them with `Environment=` lines in the quadlet unit
(`[Container]` section) — these take precedence over the image defaults:

```ini
# App-runtime knobs (read by the app):
Environment=INGEST_CONCURRENCY=1   # photos decoded/encoded at once
Environment=SHARP_CONCURRENCY=2    # libvips threads per op
# Boot-time knobs (consumed by libuv/V8 before app code — must be env, not .env):
Environment=UV_THREADPOOL_SIZE=4
Environment=NODE_OPTIONS=--max-old-space-size=1024
# Cap container memory to match the heap budget:
Memory=2G
```

Rule of thumb: keep `INGEST_CONCURRENCY × SHARP_CONCURRENCY ≤ core count`. See
[Running & maintenance → Ingest tuning](./running-and-maintenance.md#ingest-tuning).

## 3. Install the quadlet unit

Copy the provided unit file to the systemd container drop-in directory:

Quadlet file: [atelier-photo.container](podman/atelier-photo.container)

```sh
# Rootless (recommended — runs as your user)
mkdir -p ~/.config/containers/systemd
cp podman/atelier-photo.container ~/.config/containers/systemd/

# Or system-wide (runs as root)
sudo cp podman/atelier-photo.container /etc/containers/systemd/
```

## 4. Start the service

```sh
# Rootless
systemctl --user daemon-reload
systemctl --user enable --now atelier-photo

# System-wide
sudo systemctl daemon-reload
sudo systemctl enable --now atelier-photo
```

## 5. Run the database migration

On first boot (and after any schema update), run the migration inside the
container:

```sh
podman exec -it systemd-atelier-photo node dist/server/db/migrate.js
```

## Useful commands

| Command | Description |
|---|---|
| `systemctl --user status atelier-photo` | Check service status |
| `journalctl --user -u atelier-photo -f` | Follow live logs |
| `systemctl --user restart atelier-photo` | Restart after a config change |
| `systemctl --user stop atelier-photo` | Stop the service |
| `podman volume inspect atelier-photo-data` | Inspect the data volume |

## Updating

**From ghcr.io:**

```sh
podman pull ghcr.io/wisnuprama/atelier-photo:latest
systemctl --user restart atelier-photo
```

**From source:**

```sh
podman build -t localhost/atelier-photo:latest .
systemctl --user restart atelier-photo
```

The named volume `atelier-photo-data` persists the database and all images across
restarts and updates.
