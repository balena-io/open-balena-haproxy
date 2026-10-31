# https://hub.docker.com/_/haproxy
FROM haproxy:3.4-alpine@sha256:2caaf8b1a1ef67f3f1ea9b721f2821675d3ba4500fb518e23884fecb93e8dbaa

VOLUME [ "/certs" ]

USER root

RUN addgroup haproxy root \
    && mkdir -p /etc/ssl/private \
    && chown -R haproxy /etc/ssl/private \
    && apk add --no-cache --update \
    curl \
    inotify-tools \
    openssl \
    sudo

COPY cors.lua /usr/local/etc/haproxy/
COPY haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
COPY start-haproxy.sh /start-haproxy
COPY monitor_certs.sh /monitor_certs.sh
COPY errors/* /etc/haproxy/errors/

CMD /start-haproxy
