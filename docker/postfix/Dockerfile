FROM ubuntu:24.04

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y postfix mailutils inotify-tools curl iproute2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY main.cf /etc/postfix/main.cf
COPY header_checks /etc/postfix/header_checks
COPY entrypoint.sh /entrypoint.sh
COPY log-watcher.sh /log-watcher.sh
RUN chmod +x /entrypoint.sh /log-watcher.sh

EXPOSE 25

ENTRYPOINT ["/entrypoint.sh"]
