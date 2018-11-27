/*
Copyright 2018 Balena Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { writeFile } from 'fs';
import { URL } from 'url';

// Ensure third arg is optional to remove CB
const writeFileAsync: (
	path: string | number | Buffer | URL,
	options?: {},
	arg3?: (err: NodeJS.ErrnoException) => void,
) => Bluebird<{}> = Bluebird.promisify(writeFile);

export interface ServiceBackend {
	url: string;
}

export interface ServiceFrontend {
	protocol: string;
	port: number;
	domain: string;
	subdomain?: string;
	crt?: string;
}

export interface ConfigurationEntry {
	frontend: ServiceFrontend[];
	backend: ServiceBackend[];
}

/**
 * Configuration object inteface. Holds an internal representation of input
 */
export interface Configuration {
	[service: string]: ConfigurationEntry;
}

interface InternalConfig {
	frontend: any;
	backend: any;
}

/**
 * Certificate chain string
 * @type {string}
 */
let chain = '';

/**
 * Array of reserved ports for internal routing tricks
 * @type {Array}
 */
let reservedPorts: number[] = [];

/**
 * Configuration object. Holds an internal representation of input
 * @type {{frontend: {}, backend: {}}}
 */
let configuration: InternalConfig = {
	frontend: {},
	backend: {},
};

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
	'timeout server 60000\n';

/**
 * HAProxy back-end configuration string.
 * @type {string}
 */
let configurationBackendStr = '';

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
const getFreePort = (
	configuration: InternalConfig,
	minPort: number,
	maxPort: number,
	reserved: number[],
): number | undefined => {
	let usedPorts = _.keysIn(_.get(configuration, ['frontend', 'tcp']))
		.map(Number)
		.concat(_.keysIn(_.get(configuration, ['frontend', 'https'])).map(Number))
		.concat(_.keysIn(_.get(configuration, ['frontend', 'http'])).map(Number))
		.concat(reserved);
	for (let p = minPort; p < maxPort; p++) {
		if (!usedPorts.includes(p)) {
			return p;
		}
	}
};

/**
 * Generates HAProxy back-ends configuration,
 * using input parameter configuration['backend'] structure
 * @param configuration: object containing backend key. Backend contains a list of backends, with structure:
 *   "backendName": {
 *     "proto": "protocol",
 *     "port": port,
 *     "backend": "backend_host"
 *   }
 * @returns {string} HAProxy back-ends configuration
 */
const generateBackendConfig = (configuration: InternalConfig): string => {
	let confStr = '';
	_.forEach(configuration['backend'], (backend, name) => {
		confStr += `\nbackend ${name}\n` + `mode ${backend[0].proto}\n`;
		if (backend[0].proto === 'http') {
			confStr += 'option forwardfor\n' + 'balance roundrobin\n';
		}

		_.forEach(backend, be => {
			if (be.port === '443') {
				confStr += `server ${be.backend} ${be.backend}:${
					be.port
				} send-proxy-v2 check-send-proxy port ${be.port}\n`;
			} else {
				confStr += `server ${be.backend} ${be.backend}:${be.port} check port ${
					be.port
				}\n`;
			}
		});
	});
	return confStr;
};

/**
 * Generates HAProxy TCP front-end configuration,
 * using input parameter configuration['frontend']['tcp']['port'] structure
 * @param configuration: object containing 'frontend.tcp'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backendName": backendName_to_use
 *   }
 * @param port: Port to generate tcp configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateTcpConfig = (
	configuration: InternalConfig,
	port: number,
): string => {
	let confStr = '';
	if (!_.get(configuration, ['frontend', 'https', port])) {
		confStr +=
			`\nfrontend tcp_${port}_in\n` + 'mode tcp\n' + `bind *:${port}\n`;
		_.forEach(configuration['frontend']['tcp'][port], acl => {
			confStr += `default_backend ${acl.backendName}\n`;
		});
	}
	return confStr;
};

/**
 * Generates HAProxy HTTP front-end configuration,
 * using input parameter configuration['frontend']['http']['port'] structure
 * @param configuration: object containing 'frontend.http'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backendName": backendName_to_use
 *   }
 * @param port: Port to generate http configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateHttpConfig = (
	configuration: InternalConfig,
	port: number,
): string => {
	let confStr =
		`\nfrontend http_${port}_in\n` +
		'mode http\n' +
		'option forwardfor\n' +
		`bind *:${port}\n` +
		'reqadd X-Forwarded-Proto:\\ http\n';
	_.forEach(configuration['frontend']['http'][port], acl => {
		confStr +=
			'\n' +
			`acl host_${acl.backendName} hdr_dom(host) -i ${acl.domain}\n` +
			`use_backend ${acl.backendName} if host_${acl.backendName}\n`;
	});
	return confStr;
};

/**
 * Generates HAProxy HTTPS front-end configuration,
 * using input parameter configuration['frontend']['https']['port'] structure
 * @param configuration: object containing 'frontend.https'[port] path.
 * The structure, contains a list of front-ends definitions as below:
 *   {
 *     "domain": "domain",
 *     "backendName": backendName_to_use
 *   }
 * @param port: Port to generate https configuration for
 * @returns {string} HAProxy front-end configuration for specified port.
 */
const generateHttpsConfig = (
	configuration: InternalConfig,
	port: number,
	crtPath: string,
): string => {
	let confStr = '';

	// In case the port is used for both https and tcp traffic:
	if (_.get(configuration, ['frontend', 'tcp', port])) {
		let freePort = getFreePort(configuration, 1000, 10000, reservedPorts);

		// What here? We can't continue, so we just throw an error
		if (!freePort) {
			throw new Error('Cannot find a free port for a service');
		}
		reservedPorts.push(freePort);
		let tcpBackend = _.get(configuration, ['frontend', 'tcp', port])[0][
			'backendName'
		];

		confStr +=
			`\nfrontend https_${port}_in\n` +
			'mode tcp\n' +
			`bind *:${port}\n` +
			'tcp-request inspect-delay 2s\n' +
			'tcp-request content accept if { req.ssl_hello_type 1 }\n' +
			'acl is_ssl req.ssl_ver 2:3.4\n' +
			`use_backend redirect_to_${freePort}_in if is_ssl\n` +
			`use_backend ${tcpBackend} if !is_ssl\n` +
			'\n' +
			`backend redirect_to_${freePort}_in\n` +
			'mode tcp\n' +
			'balance roundrobin\n' +
			`server localhost 127.0.0.1:${freePort} send-proxy-v2\n` +
			'\n' +
			`frontend ${freePort}_in\n` +
			'mode http\n' +
			'option forwardfor\n' +
			`bind 127.0.0.1:${freePort} ssl crt ${crtPath} accept-proxy\n` +
			'reqadd X-Forwarded-Proto:\\ https\n';

		confStr += _.map(configuration['frontend']['https'][port], acl => {
			return (
				'\n' +
				`acl host_${acl.backendName} hdr_dom(host) -i ${acl.domain}\n` +
				`use_backend ${acl.backendName} if host_${acl.backendName}\n`
			);
		}).join('');
	} else {
		confStr +=
			`\nfrontend https_${port}_in\n` +
			'mode http\n' +
			`bind *:${port} ssl crt ${crtPath}\n` +
			'reqadd X-Forwarded-Proto:\\ https\n';

		confStr += _.map(configuration['frontend']['https'][port], acl => {
			return (
				'\n' +
				`acl host_${acl.backendName} hdr_dom(host) -i ${acl.domain}\n` +
				`use_backend ${acl.backendName} if host_${acl.backendName}\n`
			);
		}).join('');
	}

	return confStr;
};

const updateCertChain = (chain: string, cert: string): string => {
	if (!chain.includes(cert)) {
		chain += cert;
	}
	return chain;
};

// Populate configuration internal representation from input
export function GenerateHaproxyConfig(
	config: Configuration,
	configOutputPath: string,
	certOutputPath: string,
): Bluebird<{}> {
	return (
		Bluebird.map(_.toPairs(config), ([key, value]) => {
			let backendName = key + '_backend';
			_.forEach(value['frontend'], frontend => {
				// Decompose synthetic proto:domain:port objects.
				let proto = _.get(frontend, 'protocol');
				let subdomain = _.get(frontend, 'subdomain');
				let domain = subdomain
					? subdomain + '.' + _.get(frontend, 'domain')
					: _.get(frontend, 'domain');
				let port = _.get(frontend, 'port');

				if (_.get(configuration['frontend'], proto)) {
					if (_.get(configuration['frontend'][proto], port)) {
						configuration['frontend'][proto][port] = configuration['frontend'][
							proto
						][port].concat([{ domain: domain, backendName: backendName }]);
					} else {
						configuration['frontend'][proto][port] = [
							{ domain: domain, backendName: backendName },
						];
					}
				} else {
					configuration['frontend'][proto] = {
						[port]: [{ domain: domain, backendName: backendName }],
					};
				}
				const frontendCrt = _.get(frontend, 'crt');
				if (frontendCrt) {
					chain = updateCertChain(chain, frontendCrt);
				}
			});

			_.forEach(value['backend'], backend => {
				let [backendProto, domain, backendPort] = _.split(backend['url'], ':');
				domain = domain.replace(/^\/\//g, '');
				if (!_.get(configuration['backend'], backendName)) {
					configuration['backend'][backendName] = [
						{
							proto: backendProto,
							port: backendPort,
							backend: domain,
						},
					];
				} else {
					if (
						!_.filter(
							configuration['backend'][backendName],
							i =>
								i.proto === backendProto &&
								i.port === backendPort &&
								i.backend === domain,
						).length
					) {
						configuration['backend'][backendName] = configuration['backend'][
							backendName
						].concat({
							proto: backendProto,
							port: backendPort,
							backend: domain,
						});
					}
				}
			});
		})
			// Generate HAProxy configuration segments.
			.then(() => {
				_.forEach(configuration['frontend'], (protoValue, proto) => {
					_.forEach(protoValue, (_portValue, port: number) => {
						if (proto === 'tcp') {
							configurationString += generateTcpConfig(configuration, port);
						} else if (proto === 'http') {
							configurationString += generateHttpConfig(configuration, port);
						} else if (proto === 'https') {
							configurationString += generateHttpsConfig(
								configuration,
								port,
								certOutputPath,
							);
						}
					});
				});
				configurationBackendStr = generateBackendConfig(configuration);
			})
			// Store HAProxy configuration to file.
			.then(() => {
				return writeFileAsync(
					configOutputPath,
					configurationString + configurationBackendStr,
				);
			})
			// Store Certificate chain to crtPath.
			.then(() => {
				return writeFileAsync(certOutputPath, chain);
			})
	);
}