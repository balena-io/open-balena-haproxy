# https://hub.docker.com/_/haproxy
FROM haproxy:2.6-alpine

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
