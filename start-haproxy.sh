#!/bin/sh

set -exa

CERT_CHAIN_PATH=${CERT_CHAIN_PATH:-/certs/export/chain.pem}

mkdir -p "$(dirname "${CERT_CHAIN_PATH}")"

if ! [ -f "${CERT_CHAIN_PATH}" ]; then
    if [ -n "${HAPROXY_CRT}" ] \
      && [ -n "${HAPROXY_KEY}" ] \
      && [ -n "${ROOT_CA}" ]; then
        echo "Assembling certificate chain..." \
          && echo "${HAPROXY_CRT}" | base64 -d \
          && echo "${HAPROXY_KEY}" | base64 -d \
          && echo "${ROOT_CA}" | base64 -d > "${CERT_CHAIN_PATH}"
    fi
fi

haproxy -f /usr/local/etc/haproxy/haproxy.cfg -W &
HAPROXY_PID=$!

while true; do
    inotifywait -r -e create -e modify -e delete /certs
    echo "Certificate change detected. Reloading..."
    kill -SIGUSR2 $HAPROXY_PID
    sleep 1;
done
