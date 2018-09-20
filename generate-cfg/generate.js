#!/usr/bin/env node

const generateHaproxyConfig = require('./generate-haproxy-cfg').generateHaproxyConfig

generateHaproxyConfig(
	'/.balena/config.json',
	'/usr/local/etc/haproxy/haproxy.cfg',
	'/etc/ssl/private/haproxy.cert.chain.pem'
)

