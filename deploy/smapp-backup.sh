#!/bin/sh
# Back up everything the SMCHS app cannot rebuild by itself.
#
#   /opt/smapp/deploy/smapp-backup.sh [destination-dir]
#
# Default destination /var/backups/smapp, keeping the 14 most recent archives.
# Run it from cron (Alpine):
#
#   echo '15 2 * * * /opt/smapp/deploy/smapp-backup.sh' >> /etc/crontabs/root
#   rc-service crond restart
#
# What it saves, and why each one matters:
#   data.json  — everything admins have published (notices, schedule overrides,
#                announcements, contacts, dining, map pins). Losing it silently
#                empties the app for every device.
#   auth.db    — staff accounts: emails, scrypt password digests, session and
#                setup tokens. Losing it signs out every staff member and forces
#                the whole password-setup cycle again.
#   push.db    — Web Push subscriptions AND the server's VAPID keypair. Losing
#                the keypair orphans every device's subscription silently: no
#                error, notifications simply stop arriving.
#
# Deliberately NOT saved: schedule-history.json, event-history.json, staff.json
# and tiles/ — all caches, rebuilt from smhs.org on demand.
set -eu

APP_DIR="${APP_DIR:-/opt/smapp}"
DATA_DIR="$APP_DIR/server/.data"
DEST="${1:-/var/backups/smapp}"
KEEP="${KEEP:-14}"

[ -d "$DATA_DIR" ] || { echo "no data directory at $DATA_DIR" >&2; exit 1; }

mkdir -p "$DEST"
chmod 0700 "$DEST"

stamp=$(date +%Y%m%d-%H%M%S)
archive="$DEST/smapp-$stamp.tar.gz"

# Only include the files that actually exist: a fresh server has no data.json
# until an admin publishes, and no auth.db until a staff account is created.
set --
for f in data.json auth.db push.db; do
	[ -f "$DATA_DIR/$f" ] && set -- "$@" "$f"
done

if [ "$#" -eq 0 ]; then
	echo "nothing to back up yet: no data.json, auth.db or push.db in $DATA_DIR" >&2
	exit 0
fi

# The SQLite databases run in journal_mode=delete (verified: no -wal/-shm
# sidecars exist), so each database is a single self-contained file and there is
# no companion log that could be missed. Copy first, then archive, so a write
# landing mid-tar cannot produce a truncated member.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
for f in "$@"; do
	cp -p "$DATA_DIR/$f" "$tmp/$f"
done

tar -czf "$archive" -C "$tmp" "$@"
chmod 0600 "$archive"
echo "wrote $archive ($(wc -c < "$archive") bytes): $*"

# Prune old archives, keeping the newest $KEEP.
ls -1t "$DEST"/smapp-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
	rm -f "$old"
	echo "pruned $old"
done

# These archives are only as safe as this box. Ship them off-host as well —
# a server that dies takes its local backups with it.
