FROM alpine:3.20

RUN apk add --no-cache unbound bind-tools

EXPOSE 53/tcp
EXPOSE 53/udp

CMD ["unbound", "-d", "-c", "/etc/unbound/unbound.conf"]
