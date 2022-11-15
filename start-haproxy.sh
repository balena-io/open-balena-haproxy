#!/bin/sh

set -ea

[ "${VERBOSE}" = 'true' ] && set -x

CERT_CHAIN_PATH=${CERT_CHAIN_PATH:-/certs/export/chain.pem}

if [ -n "${HAPROXY_CRT}" ] && [ -n "${HAPROXY_KEY}" ]; then
	tmpcfg="$(mktemp)"
	echo "Assembling certificate chain..."
	mkdir -p "$(dirname "${CERT_CHAIN_PATH}")"
	echo "${HAPROXY_CRT}" | base64 -d > "${tmpcfg}"

	# certificates issued by private CA
	if [ -n "${ROOT_CA}" ]; then
		echo "${ROOT_CA}" | base64 -d >> "${tmpcfg}"
	fi

	echo "${HAPROXY_KEY}" | base64 -d >> "${tmpcfg}"
	cat < "${tmpcfg}" > "${CERT_CHAIN_PATH}"
	rm -f "${tmpcfg}"
fi

sudo -Eu haproxy haproxy -f /usr/local/etc/haproxy/haproxy.cfg -W &
HAPROXY_PID=$!
echo "haproxy started with pid "$HAPROXY_PID

# Trap and forward USR1 ( graceful stop ) to haproxy
_usr1() {
	echo "Caught SIGUSR1 signal!"
	kill -USR1 "$HAPROXY_PID" 2>/dev/null
}
trap _usr1 USR1

# Trap and forward TERM ( hard stop ) to haproxy
_term() {
	echo "Caught SIGTERM signal!"
	kill -TERM "$HAPROXY_PID" 2>/dev/null
}
trap _term TERM

sudo -Eu haproxy /monitor_certs.sh $HAPROXY_PID &

# Wait for haproxy to process its exit signal
wait "$HAPROXY_PID"
