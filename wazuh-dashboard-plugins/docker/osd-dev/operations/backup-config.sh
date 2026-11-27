#!/usr/bin/env bash
# Configuration backup only. This is not an index snapshot or a full restore image.
set -euo pipefail
umask 077
manager_container="${1:-os-dev-2196-wazuh.manager-1}"
indexer_container="${2:-os-dev-2196-os1-1}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
backup_root="${repo_root}/.local-backups"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
backup_dir="$(mktemp -d "${backup_root}/config-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
# Output is redirected to private files so keys and passwords never reach terminal output.
docker exec -u 0 "$manager_container" tar -C / -czf - var/ossec/etc var/ossec/api/configuration > "$backup_dir/manager-config.tar.gz"
docker exec -u 0 "$indexer_container" tar -C / -czf - usr/share/opensearch/config > "$backup_dir/indexer-config.tar.gz"
tar -C "$repo_root" -czf "$backup_dir/development-config.tar.gz" docker/osd-dev/config
for archive in "$backup_dir"/*.tar.gz; do
  tar -tzf "$archive" >/dev/null
done
(cd "$backup_dir" && sha256sum ./*.tar.gz > SHA256SUMS)
printf '%s\n' 'Configuration-only backup. Contains secrets: keep private and encrypt before external storage.' \
  'Indexer security API changes reside in the security index; the config archive alone does not capture them.' \
  'Index data, alerts, live databases, container images, and Docker volume contents are not included.' \
  'Use an indexer snapshot and a coordinated manager backup for full recovery.' > "$backup_dir/SCOPE.txt"
printf 'Configuration backup created and archive integrity checked: %s\n' "$backup_dir"
