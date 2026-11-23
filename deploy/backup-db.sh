#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/chainroll/backups"
ENV_FILE="/opt/chainroll/.env"
KEEP_DAYS=7
TS="$(date -u +%Y%m%d-%H%M%S)"
FILENAME="chainroll-${TS}.sql.gz"
OUT="${BACKUP_DIR}/${FILENAME}"

umask 077
mkdir -p "$BACKUP_DIR"

docker exec chainroll-db pg_dump -U chainroll -d chainroll --clean --if-exists | gzip -9 > "$OUT"
chmod 600 "$OUT"

# Prune local backups older than KEEP_DAYS
find "$BACKUP_DIR" -type f -name 'chainroll-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Local backup OK: ${OUT} (${SIZE})"

# Off-site upload to Cloudflare R2 private bucket (chainroll-private/backups/)
if [ -f "$ENV_FILE" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$ENV_FILE" "$OUT" "backups/${FILENAME}" <<'PY'
import datetime, hashlib, hmac, os, sys, urllib.request

env_path, file_path, obj_key = sys.argv[1], sys.argv[2], sys.argv[3]
env = {}
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

acct = env.get("R2_ACCOUNT_ID", "")
ak = env.get("R2_ACCESS_KEY_ID", "")
sk = env.get("R2_SECRET_ACCESS_KEY", "")
bucket = env.get("R2_PRIVATE_BUCKET", "chainroll-private")

if not (acct and ak and sk):
    print("R2 off-site upload skipped (R2 credentials not configured)")
    sys.exit(0)

with open(file_path, "rb") as f:
    payload = f.read()

now = datetime.datetime.now(datetime.timezone.utc)
amz_date = now.strftime("%Y%m%dT%H%M%SZ")
date_stamp = now.strftime("%Y%m%d")
region = "auto"
service = "s3"
host = f"{acct}.r2.cloudflarestorage.com"
canonical_uri = f"/{bucket}/{obj_key}"
payload_hash = hashlib.sha256(payload).hexdigest()

canonical_headers = (
    f"host:{host}\n"
    f"x-amz-content-sha256:{payload_hash}\n"
    f"x-amz-date:{amz_date}\n"
)
signed_headers = "host;x-amz-content-sha256;x-amz-date"
canonical_request = f"PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"

credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
string_to_sign = (
    f"AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n"
    + hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
)

def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

k_date = sign(("AWS4" + sk).encode("utf-8"), date_stamp)
k_region = sign(k_date, region)
k_service = sign(k_region, service)
k_signing = sign(k_service, "aws4_request")
signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

auth_header = (
    f"AWS4-HMAC-SHA256 Credential={ak}/{credential_scope}, "
    f"SignedHeaders={signed_headers}, Signature={signature}"
)

url = f"https://{host}{canonical_uri}"
req = urllib.request.Request(
    url,
    data=payload,
    method="PUT",
    headers={
        "Host": host,
        "Content-Type": "application/gzip",
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
        "Authorization": auth_header,
    },
)
with urllib.request.urlopen(req, timeout=30) as resp:
    if resp.status in (200, 201, 204):
        print(f"R2 off-site backup OK: s3://{bucket}/{obj_key} ({len(payload)} bytes)")
    else:
        print(f"R2 off-site backup unexpected status: {resp.status}", file=sys.stderr)
        sys.exit(1)
PY
fi
