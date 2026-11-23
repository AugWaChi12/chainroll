#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/chainroll/.env"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <KEY_NAME>" >&2
  echo "Example: $0 POSTGRES_PASSWORD" >&2
  exit 1
fi

KEY="$1"
if [[ ! "$KEY" =~ ^[A-Z0-9_]+$ ]]; then
  echo "Error: KEY_NAME must match ^[A-Z0-9_]+$" >&2
  exit 1
fi

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

printf "Enter value for %s (hidden): " "$KEY"
IFS= read -rs VALUE
printf "\n"

if [[ -z "$VALUE" ]]; then
  echo "Aborted: empty value." >&2
  exit 1
fi

TMP="$(mktemp)"
chmod 600 "$TMP"
grep -v "^${KEY}=" "$ENV_FILE" > "$TMP" || true
printf "%s=%s\n" "$KEY" "$VALUE" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Saved ${KEY} into ${ENV_FILE} (value not printed)."
