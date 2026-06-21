# Self-hosting with Podman Quadlet

Quadlet integrates Podman containers with systemd so the gallery starts on boot,
restarts on failure, and is managed with standard `systemctl` commands.

## 1. Build the image

```sh
podman build -t localhost/atelier-photo:latest .
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

## 3. Install the quadlet unit

Copy the provided unit file to the systemd container drop-in directory:

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

```sh
podman build -t localhost/atelier-photo:latest .
systemctl --user restart atelier-photo
```

The named volume `atelier-photo-data` persists the database and all images across
restarts and updates.
