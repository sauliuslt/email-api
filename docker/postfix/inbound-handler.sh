#!/bin/bash
# Receives piped email from Postfix virtual transport and forwards to API
# Source env vars (Postfix pipe daemon doesn't inherit container environment)
. /etc/inbound-env

SENDER="$1"
RECIPIENT="$2"
RAW_EMAIL=$(cat | base64 -w 0)
curl -s -X POST "$API_URL/internal/inbound" \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
    -d "{\"sender\":\"$SENDER\",\"recipient\":\"$RECIPIENT\",\"rawEmail\":\"$RAW_EMAIL\"}" \
    >/dev/null 2>&1
exit 0
