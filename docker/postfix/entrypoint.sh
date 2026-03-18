#!/bin/bash
set -e

CONFIG_DIR="/etc/postfix/dynamic"
mkdir -p "$CONFIG_DIR"

# Apply dynamic config if it exists
apply_config() {
    # Build sender_transport hash map (create empty if missing)
    if [ ! -f "$CONFIG_DIR/sender_transport" ]; then
        touch "$CONFIG_DIR/sender_transport"
    fi
    postmap hash:"$CONFIG_DIR/sender_transport" 2>/dev/null || true

    # Build virtual_domains hash map for inbound mail (create empty if missing)
    if [ ! -f "$CONFIG_DIR/virtual_domains" ]; then
        touch "$CONFIG_DIR/virtual_domains"
    fi
    postmap hash:"$CONFIG_DIR/virtual_domains" 2>/dev/null || true

    # Regenerate master.cf dynamic transports section
    sed -i '/^# BEGIN DYNAMIC TRANSPORTS/,/^# END DYNAMIC TRANSPORTS/d' /etc/postfix/master.cf
    if [ -f "$CONFIG_DIR/master_transports.cf" ] && [ -s "$CONFIG_DIR/master_transports.cf" ]; then
        echo "# BEGIN DYNAMIC TRANSPORTS" >> /etc/postfix/master.cf
        cat "$CONFIG_DIR/master_transports.cf" >> /etc/postfix/master.cf
        echo "# END DYNAMIC TRANSPORTS" >> /etc/postfix/master.cf
    fi
}

# Configure DNS resolver for Postfix (host network mode — no Docker DNS)
if [ -n "$DNS_RESOLVER_IP" ]; then
    mkdir -p /var/spool/postfix/etc
    echo "nameserver $DNS_RESOLVER_IP" > /var/spool/postfix/etc/resolv.conf
    echo "nameserver $DNS_RESOLVER_IP" > /etc/resolv.conf
    echo "options ndots:0" >> /etc/resolv.conf
    echo "Using DNS resolver: $DNS_RESOLVER_IP"
fi

# Disable chroot for all Postfix services (container is already isolated)
sed -i 's/^\([a-z].*\)\(unix\s\+-\s\+-\s\+\)y/\1\2n/' /etc/postfix/master.cf
sed -i 's/^\([a-z].*\)\(inet\s\+n\s\+-\s\+\)y/\1\2n/' /etc/postfix/master.cf

# Add inbound pipe transport for virtual_transport (idempotent)
if ! grep -q '^inbound-pipe' /etc/postfix/master.cf; then
    cat >> /etc/postfix/master.cf <<'INBOUND_EOF'
# Inbound email pipe transport
inbound-pipe  unix  -       n       n       -       10      pipe
  flags=DRhu user=nobody argv=/inbound-handler.sh ${sender} ${recipient}
INBOUND_EOF
    echo "Added inbound-pipe transport to master.cf"
fi

# Write environment for inbound handler (Postfix pipe daemon strips env)
cat > /etc/inbound-env <<EOF
API_URL="${API_URL:-http://email-api:3000}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET}"
EOF
chmod 644 /etc/inbound-env

# Apply initial config
apply_config

# Set myhostname from dynamic config (written by API from DB domains)
if [ -f "$CONFIG_DIR/myhostname" ]; then
    HOSTNAME_VAL=$(cat "$CONFIG_DIR/myhostname")
    postconf -e "myhostname = $HOSTNAME_VAL"
    echo "Using mail hostname from DB: $HOSTNAME_VAL"
fi

# Start Postfix in background
touch /var/log/postfix.log
postfix start

echo "Postfix started, watching for config changes..."

# Tail log file in background so it appears in Docker logs
tail -F /var/log/postfix.log &

# Start log watcher to report delivery status to the API
/log-watcher.sh &

# Create trigger file if it doesn't exist
touch "$CONFIG_DIR/.reload-trigger"

# Watch for config reload trigger
inotifywait -m -e close_write "$CONFIG_DIR/.reload-trigger" 2>/dev/null | while read -r; do
    echo "Config reload triggered, applying changes..."
    apply_config
    if [ -f "$CONFIG_DIR/myhostname" ]; then
        postconf -e "myhostname = $(cat "$CONFIG_DIR/myhostname")"
    fi
    postfix reload 2>/dev/null || true
    echo "Postfix reloaded."
done
