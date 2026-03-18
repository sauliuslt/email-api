#!/bin/bash
# Watches Postfix log for delivery status and reports to the email-api
set -e

API_URL="${API_URL:-http://email-api:3000}"
LOG_FILE="/var/log/postfix.log"

echo "Log watcher started, watching $LOG_FILE, reporting to $API_URL"

tail -n 0 -F "$LOG_FILE" 2>/dev/null | while read -r line; do
    # Only process smtp/lmtp delivery lines with status=sent|bounced|deferred
    # Pattern uses postfix* to match custom syslog_name (e.g. postfix-example.com/smtp)
    case "$line" in
        *postfix*/smtp*status=sent*|*postfix*/smtp*status=bounced*|*postfix*/smtp*status=deferred*|\
        *postfix*/lmtp*status=sent*|*postfix*/lmtp*status=bounced*|*postfix*/lmtp*status=deferred*)
            ;;
        *) continue ;;
    esac

    # Extract queue ID: the hex string after "postfix[-domain]/smtp[PID]: "
    # [^/]* matches the optional -domain.name in custom syslog_name
    QUEUE_ID=$(echo "$line" | sed -n 's/.*postfix[^/]*\/[a-z]*\[[0-9]*\]: \([A-F0-9]*\):.*/\1/p')
    [ -z "$QUEUE_ID" ] && continue

    # Extract fields
    RECIPIENT=$(echo "$line" | sed -n 's/.*to=<\([^>]*\)>.*/\1/p')
    STATUS=$(echo "$line" | sed -n 's/.*status=\(sent\|bounced\|deferred\).*/\1/p')
    RELAY=$(echo "$line" | sed -n 's/.*relay=\([^,]*\).*/\1/p')
    DSN=$(echo "$line" | sed -n 's/.*dsn=\([^,]*\).*/\1/p')
    # Extract response text inside parentheses after status=
    RESPONSE=$(echo "$line" | sed -n 's/.*status=[a-z]* (\(.*\))/\1/p')

    # Escape quotes in response for JSON
    RESPONSE=$(echo "$RESPONSE" | sed 's/"/\\"/g')

    if [ -n "$QUEUE_ID" ] && [ -n "$STATUS" ]; then
        curl -s -X POST "$API_URL/internal/delivery-status" \
            -H "Content-Type: application/json" \
            -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
            -d "{\"queueId\":\"$QUEUE_ID\",\"status\":\"$STATUS\",\"recipient\":\"$RECIPIENT\",\"relay\":\"$RELAY\",\"dsn\":\"$DSN\",\"response\":\"$RESPONSE\"}" \
            >/dev/null 2>&1 &
    fi
done
