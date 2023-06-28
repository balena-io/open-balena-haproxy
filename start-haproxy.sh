#!/bin/sh

set -ea

[ "${VERBOSE}" = 'true' ] && set -x

CERTS=${CERTS:-/certs}
CERT_CHAIN_PATH=${CERT_CHAIN_PATH:-/certs/export/chain.pem}

function update_ca_certificates() {
    # only set CA bundle if using private certificate chain
    if [[ -e "${CERTS}/ca-bundle.pem" ]]; then
        if [[ "$(readlink -f "${CERTS}/export/chain.pem")" =~ \/private\/ ]]; then
            mkdir -p /usr/local/share/ca-certificates
            cat < "${CERTS}/root-ca.pem" > /usr/local/share/ca-certificates/balenaRootCA.crt
            cat < "${CERTS}/server-ca.pem" > /usr/local/share/ca-certificates/balenaServerCA.crt
            # shellcheck disable=SC2034
            CURL_CA_BUNDLE=${CURL_CA_BUNDLE:-${CERTS}/ca-bundle.pem}
        else
            rm -f /usr/local/share/ca-certificates/balena*CA.crt
            unset CURL_CA_BUNDLE
        fi
        update-ca-certificates
    fi
}

update_ca_certificates

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
	rm -f "${CERT_CHAIN_PATH}"
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
