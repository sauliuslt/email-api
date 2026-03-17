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

    # Regenerate master.cf dynamic transports section
    sed -i '/^# BEGIN DYNAMIC TRANSPORTS/,/^# END DYNAMIC TRANSPORTS/d' /etc/postfix/master.cf
    if [ -f "$CONFIG_DIR/master_transports.cf" ] && [ -s "$CONFIG_DIR/master_transports.cf" ]; then
        echo "# BEGIN DYNAMIC TRANSPORTS" >> /etc/postfix/master.cf
        cat "$CONFIG_DIR/master_transports.cf" >> /etc/postfix/master.cf
        echo "# END DYNAMIC TRANSPORTS" >> /etc/postfix/master.cf
    fi
}

# Point Postfix DNS to Unbound resolver for MX lookups
# Keep Docker's DNS (127.0.0.11) for container name resolution
if [ -n "$DNS_RESOLVER" ]; then
    RESOLVER_IP=$(getent hosts "$DNS_RESOLVER" | awk '{print $1}' | head -1)
    if [ -n "$RESOLVER_IP" ]; then
        mkdir -p /var/spool/postfix/etc
        echo "nameserver $RESOLVER_IP" > /var/spool/postfix/etc/resolv.conf
        cp /etc/resolv.conf /etc/resolv.conf.bak
        echo "nameserver 127.0.0.11" > /etc/resolv.conf
        echo "nameserver $RESOLVER_IP" >> /etc/resolv.conf
        echo "options ndots:0" >> /etc/resolv.conf
        echo "Using DNS resolver: $DNS_RESOLVER ($RESOLVER_IP)"
    fi
fi

# Disable chroot for all Postfix services (container is already isolated)
# This ensures processes can read /etc/resolv.conf for DNS resolution
sed -i 's/^\([a-z].*\)\(unix\s\+-\s\+-\s\+\)y/\1\2n/' /etc/postfix/master.cf
sed -i 's/^\([a-z].*\)\(inet\s\+n\s\+-\s\+\)y/\1\2n/' /etc/postfix/master.cf

# Add public IPs from transport config to container's network interface
# This allows smtp_bind_address to work inside the container
add_bind_ips() {
    if [ -f "$CONFIG_DIR/master_transports.cf" ]; then
        for IP in $(grep -oP 'smtp_bind_address=\K[0-9.]+' "$CONFIG_DIR/master_transports.cf" 2>/dev/null | sort -u); do
            if ! ip addr show | grep -q "$IP"; then
                ip addr add "$IP/32" dev eth0 2>/dev/null && echo "Added bind IP: $IP" || echo "Failed to add IP: $IP (may not be routed to this host)"
            fi
        done
    fi
}

# Apply initial config
apply_config
add_bind_ips

# Set myhostname from dynamic config (written by API from DB domains) or env fallback
if [ -f "$CONFIG_DIR/myhostname" ]; then
    HOSTNAME_VAL=$(cat "$CONFIG_DIR/myhostname")
    postconf -e "myhostname = $HOSTNAME_VAL"
    echo "Using mail hostname from DB: $HOSTNAME_VAL"
elif [ -n "$MAIL_HOSTNAME" ]; then
    postconf -e "myhostname = $MAIL_HOSTNAME"
    echo "Using mail hostname from env: $MAIL_HOSTNAME"
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
    add_bind_ips
    if [ -f "$CONFIG_DIR/myhostname" ]; then
        postconf -e "myhostname = $(cat "$CONFIG_DIR/myhostname")"
    fi
    postfix reload 2>/dev/null || true
    echo "Postfix reloaded."
done
