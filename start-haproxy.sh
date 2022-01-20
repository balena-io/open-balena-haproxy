#!/bin/sh

set -ea

[ "${VERBOSE}" = 'true' ] && set -x

CERT_CHAIN_PATH=${CERT_CHAIN_PATH:-/certs/export/chain.pem}

if ! [ -f "${CERT_CHAIN_PATH}" ]; then
    if [ -n "${HAPROXY_CRT}" ] && [ -n "${HAPROXY_KEY}" ]; then
        tmpcfg="$(mktemp)"
        echo "Assembling certificate chain..."
        mkdir -p "$(dirname "${CERT_CHAIN_PATH}")"
        echo "${HAPROXY_CRT}" | base64 -d > "${tmpcfg}"

        # certificates issued by private CA
        if [ -n "${ROOT_CA}" ]; then
            echo "${ROOT_CA}" | base64 -d "${tmpcfg}"
        fi

        echo "${HAPROXY_KEY}" | base64 -d > "${tmpcfg}"
        cat < "${tmpcfg}" > "${CERT_CHAIN_PATH}"
        rm -f "${tmpcfg}"
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
