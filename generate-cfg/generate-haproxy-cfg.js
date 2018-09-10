'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const { readFileAsync, writeFileAsync} = Promise.promisifyAll(require('fs'))

/**
 * Certificate chain string
 * @type {string}
 */
let chain = ''

/**
 * Array of reserved ports for internal routing tricks
 * @type {Array}
 */
let reservedPorts = []


/**
 * Configuration object. Holds an internal representation of input
 * @type {{frontend: {}, backend: {}}}
 */
let configuration = {
	frontend: {},
	backend: {}
}


/**
 * HAProxy front-end configuration string.
 * @type {string}
 */
let configurationString =
	'global\n' +
	'tune.ssl.default-dh-param 1024\n' +
	'\n' +
	'defaults\n' +
	'timeout connect 5000\n' +
	'timeout client 60000\n' +
	'timeout server 60000\n'


/**
 * HAProxy back-end configuration string.
 * @type {string}
 */
let configurationBackendStr = ''


/**
 * Loads json object from file
 * @param filePath: Path to json file
 * @returns {Bluebird<object>}
 */
const loadFromFile = (filePath) => {
	return readFileAsync(filePath, 'utf8')
		.then(JSON.parse)
}


/**
 * Returns a free port for some internal routing magic,
 * like using 443 for serving both tcp and https traffic to different back-ends
 * @param configuration: configuration object.
 * configuration.frontend http, https and tcp keys are used here
 * @param minPort: minimum return port
 * @param maxPort: maximum return port
 * @param reserved: list of internally reserved ports ([portNumber, ...])
 * @returns {*} Free Port number in {minPort, maxPort} range or Undefined.
 */
const getFreePort = (configuration, minPort, maxPort, reserved) => {
	let usedPorts = _.keysIn(_.get(configuration, ['frontend', 'tcp']))
		.concat(_.keysIn(_.get(configuration, ['frontend', 'https'])))
		.concat(_.keysIn(_.get(configuration, ['frontend', 'http'])))
	for (let p = minPort; p < maxPort; p++ ){
		if (!usedPorts.concat(reserved).includes(p)){
			return p
		}
	}
}


/**
 * Generates HAProxy back-ends configuration,
 * using input parameter configuration['backend'] structure
 * @param configuration: object containing backend key. Backend contains a list of backends, with structure:
 *   "backend_name": {
 *     "proto": "protocol",
 *     "port": port,
 *     "backend": "backend_host"
 *   }
 * @returns {string} HAProxy back-ends configuration
 */
const generateBackendConfig = (configuration) => {
	let confStr = ''
	_.forEach(configuration['backend'], be => {
		confStr += '\n' +
			'backend backend_' + be.backend + '_' + be.proto + '_' + be.port + '\n' +
			'mode ' + be.proto + '\n'
		if (be.proto === 'http')
			confStr +=
				'option forwardfor\n' +
				'balance roundrobin\n'
		if (be.port === '443') {
			confStr += 'server ' + be.backend + ' ' + be.backend + ':' + be.port + ' send-proxy-v2 check-send-proxy port ' + be.port + '\n'

		}
		else{
			confStr += 'server ' + be.backend + ' ' + be.backend + ':' + be.port + ' check port ' + be.port + '\n'
		}
	})
	return confStr
}


/**
 * Generates HAProxy TCP front-end configuration,
 * using input parameter configuration['frontend']['tcp']['port'] structure
 * @param configuration: object containing 'frontend.tcp'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backend_name": backend_name_to_use
 *   }
 * @param port: Port to generate tcp configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateTcpConfig = (configuration, port) => {
	let confStr = ''
	if (! _.get(configuration, ['frontend', 'https', port])) {
		confStr +=
			'\nfrontend tcp_' + port + '_in\n' +
			'mode tcp\n' +
			'bind *:' + port + '\n'
		_.forEach(configuration['frontend']['tcp'][port], acl => {
			confStr += 'default_backend backend_' + acl.backend_name + '\n'
		})
	}
	return confStr
}


/**
 * Generates HAProxy HTTP front-end configuration,
 * using input parameter configuration['frontend']['http']['port'] structure
 * @param configuration: object containing 'frontend.http'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backend_name": backend_name_to_use
 *   }
 * @param port: Port to generate http configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateHttpConfig = (configuration, port) => {
	let confStr =
		'\nfrontend http_' + port +'_in\n' +
		'mode http\n' +
		'option forwardfor\n' +
		'bind *:'+ port +'\n' +
		'reqadd X-Forwarded-Proto:\\ http\n'
	_.forEach(configuration['frontend']['http'][port], acl => {
		confStr  += '\n' +
			'acl host_' + acl.backend_name  + ' hdr_dom(host) -i ' + acl.domain + '\n' +
			'use_backend backend_' + acl.backend_name + ' if host_' + acl.backend_name + '\n'
	})
	return confStr
}


/**
 * Generates HAProxy HTTPS front-end configuration,
 * using input parameter configuration['frontend']['https']['port'] structure
 * @param configuration: object containing 'frontend.https'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backend_name": backend_name_to_use
 *   }
 * @param port: Port to generate https configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateHttpsConfig = (configuration, port, crtPath) => {

	let confStr=''

	// In case the port is used for both https and tcp traffic:
	if (_.get(configuration, ['frontend', 'tcp', port]) ){
		let freePort = getFreePort(configuration, 1000, 10000, reservedPorts)
		reservedPorts.push(freePort)
		let tcp_backend = _.get(configuration, ['frontend', 'tcp', port])[0]['backend_name']

		confStr +=
			'\nfrontend https_'+port+'_in\n' +
			'mode tcp\n' +
			'bind *:'+ port +'\n' +
			'tcp-request inspect-delay 2s\n' +
			'tcp-request content accept if { req.ssl_hello_type 1 }\n' +
			'acl is_ssl req.ssl_ver 2:3.4\n' +
			'use_backend ' +' redirect_to_' + freePort + '_in' + ' if is_ssl\n' +
			'use_backend backend_' + tcp_backend + ' if !is_ssl\n' +
			'\n' +
			'backend redirect_to_' + freePort + '_in\n' +
			'mode tcp\n' +
			'balance roundrobin\n' +
			'server localhost 127.0.0.1:'+ freePort +' send-proxy-v2\n' +
			'\n' +
			'frontend ' +freePort + '_in\n' +
			'mode http\n' +
			'option forwardfor\n' +
			'bind 127.0.0.1:' + freePort + ' ssl crt ' + crtPath + ' \n' +
			'reqadd X-Forwarded-Proto:\\ https\n'


		_.forEach(configuration['frontend']['https'][port], acl => {
			confStr += '\n' +
				'acl host_' + acl.backend_name  + ' hdr_dom(host) -i ' + acl.domain + '\n' +
				'use_backend backend_' + acl.backend_name + ' if host_' + acl.backend_name + '\n'
		})
	}
	else{
		confStr +=
			'\nfrontend https_'+port+'_in\n' +
			'mode http\n' +
			'bind *:'+ port + ' ssl crt ' + crtPath + ' \n' +
			'reqadd X-Forwarded-Proto:\\ https\n'

		_.forEach(configuration['frontend']['https'][port], acl => {
			confStr += '\n' +
				'acl host_' + acl.backend_name  + ' hdr_dom(host) -i ' + acl.domain + '\n' +
				'use_backend backend_' + acl.backend_name + ' if host_' + acl.backend_name + '\n'
		})
	}

	return confStr
}


const updateCertChain = (chain, cert) => {
	if (!chain.includes(cert)){
		chain += cert
	}
	return chain
}

// Populate configuration internal representation from input
const generate = (configPath, configOutputPath, certOutputPath) => {
	return loadFromFile(configPath).then((cfg) => {
		_.forEach(cfg, (value) => {

			// Decompose synthetic proto:domain:port objects.
			let [proto, domain, port] = _.split(value['frontend'],':')
			let [backend_proto, backend, backend_port] = _.split(value['backend'],':')
			let backend_name = backend+ '_' + backend_proto + '_' + backend_port
			if (_.get(configuration['frontend'], proto)){
				configuration['frontend'][proto][port] =
					_.get(configuration['frontend'][proto], port) ?
						configuration['frontend'][proto][port].concat([{domain: domain, backend_name:backend_name}]) :
						[{domain: domain, backend_name:backend_name}]
			}
			else {
				configuration['frontend'][proto] = {[port]: [{domain: domain, backend_name:backend_name}]}
			}

			if (_.get(value, 'crt'))chain = updateCertChain(chain, value['crt'])

			if (!_.get(configuration['backend'], backend_name)){
				configuration['backend'][backend_name] = {
					proto: backend_proto,
					port: backend_port,
					backend: backend
				}
			}
		})
	})
	// Generate HAProxy configuration segments.
		.then(()=> {
			_.forEach(configuration['frontend'], (protoValue, proto) => {
				_.forEach(protoValue, (portValue, port) => {
					if (proto === 'tcp'){
						configurationString += generateTcpConfig(configuration, port)
					}
					else if (proto === 'http'){
						configurationString += generateHttpConfig(configuration, port)
					}
					else if (proto === 'https'){
						configurationString += generateHttpsConfig(configuration, port, certOutputPath)
					}
				})
			})
			configurationBackendStr = generateBackendConfig(configuration)
		})
		// Store HAProxy configuration to file.
		.then(() => {
			return writeFileAsync(configOutputPath, configurationString+configurationBackendStr)
		})
		// Store Certificate chain to crtPath.
		.then(() => {
			return writeFileAsync(certOutputPath, chain)
		})
}

module.exports.generateHaproxyConfig = generate
