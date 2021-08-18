FROM haproxy:2.4-alpine

VOLUME [ "/certs" ]

USER root

RUN addgroup haproxy root \
    && chown -R haproxy /etc/ssl/private \
    && apk add --no-cache --update \
    curl \
    openssl \
    inotify-tools

COPY cors.lua /usr/local/etc/haproxy/
COPY haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
COPY start-haproxy.sh /start-haproxy

USER haproxy

CMD /start-haproxy
