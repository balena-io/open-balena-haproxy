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
import * as mzfs from 'mz/fs';

import { GenerateCertificate } from './utils';

/**
 * Backend server options. These are held as 'raw' HAProxy `key: value` options,
 * so should an option have more than one parameter, the `value` should specify these
 * including spaces. Options without parameters should specify a `value` of `null`.
 * Some values allow the use of dynamic properties, such as the relevant backend
 * name or port number.
 *
 */
export interface TextOption {
	[option: string]: string | undefined;
}

/**
 * Backend definition for a service.
 */
export interface ServiceBackend {
	/** The internal URL for the service. */
	url: string;
	/** HAProxy `server` options. */
	server?: TextOption;
}

/**
 * Frontend definition for a service.
 */
export interface ServiceFrontend {
	/** Protocol input into HAProxy (eg. `http`, `https`, `tcp`, etc.) */
	protocol: string;
	/** The port to listen on. */
	port: number;
	/** The domain HAProxy is proxying for, eg `mydomain.com` */
	domain: string;
	/** The subdomain for the frontend service being defined, eg. `webpages` */
	subdomain?: string;
	/** A certificate to use to identify the frontend service, in PEM format. */
	crt?: string;
	/** Timeout value to hold connections for. */
	clientTimeout?: string;
	/** Stats options. */
	stats?: TextOption[];
}

/**
 * Configuration entry, holds multiple frontend and backend definitions for the
 * specified service.
 */
export interface ConfigurationEntry {
	frontend: ServiceFrontend[];
	backend: ServiceBackend[];
}

/**
 * Configuration object inteface, converted from the JSON configuration file.
 * Each entry is a service name denoting a ConfigurationEntry object.
 */
export interface Configuration {
	[service: string]: ConfigurationEntry;
}

/**
 * An internal frontend definition for creating the HAProxy config.
 */
interface InternalFrontendEntry {
	/** The domain for the ACL. */
	domain: string;
	/** The backend name to use by the ACL. */
	backendName: string;
	/** Client connection timeout. */
	clientTimeout?: string;
	/** Stats options. */
	stats?: TextOption[];
}

/**
 * Internal backend definition for specifying the component services.
 */
interface InternalBackend {
	/** Protocol used. */
	proto: string;
	/** Port to connect to service. */
	port: string;
	/** Backend name. */
	backend: string;
	/** Server options, if any. */
	server?: TextOption;
}

/** Parent internal configuration object. */
interface InternalConfig {
	/** Frontend definitions. */
	frontend: {
		/** The protocol expected into HAProxy. */
		[protocol: string]: {
			/** A port linked to a frontend definition. */
			[port: string]: InternalFrontendEntry[];
		};
	};
	/** Backend definitions. */
	backend: {
		[component: string]: InternalBackend[];
	};
}

/**
 * Certificate chain string
 * @type {string}
 */
let fullChain = '';

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
 * Generates a stats group should the frontend option be present.
 * @param entries: Array of frontend data entries
 * @returns {string} String containing the new stats block for HAProxy
 */
const statsGenerator = (entries: InternalFrontendEntry[]): string => {
	const statsEntries = _.reduce(
		entries,
		(prev, entry) => _.union(prev, entry.stats),
		[],
	);
	let statsString = '';

	// Format entries.
	for (const stat of statsEntries) {
		statsString += `stats ${stat}\n`;
	}

	return statsString;
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

		// For each unique backend fill in the server details
		_.forEach(backend, be => {
			// Dynamic values are those which are based on specific backends
			// Configs can specify known tags to fill in with these values
			const dynamicValues = {
				'<backend>': be.backend,
				'<port>': be.port,
			};
			confStr += `server ${be.backend} ${be.backend}:${be.port}`;
			if (be.server) {
				_.map(be.server, (value, key) => {
					const dynValue = _.get(dynamicValues, `${value}`, '');
					confStr += ` ${key}${dynValue ? ` ${dynValue}` : ''}`;
				});
			}
			confStr += '\n';
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
	port: string,
): string => {
	let confStr = '';
	if (!_.get(configuration, ['frontend', 'https', port])) {
		confStr +=
			`\nfrontend tcp_${port}_in\n` + 'mode tcp\n' + `bind *:${port}\n`;
		confStr += statsGenerator(configuration['frontend']['http'][port]);
		_.forEach(configuration['frontend']['tcp'][port], acl => {
			if (acl.backendName) {
				confStr += `default_backend ${acl.backendName}\n`;
			}
			confStr += acl.clientTimeout
				? `timeout client ${acl.clientTimeout}\n`
				: '';
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
	port: string,
): string => {
	let confStr =
		`\nfrontend http_${port}_in\n` +
		'mode http\n' +
		'option forwardfor\n' +
		`bind *:${port}\n` +
		'reqadd X-Forwarded-Proto:\\ http\n';
	confStr += statsGenerator(configuration['frontend']['http'][port]);
	_.forEach(configuration['frontend']['http'][port], acl => {
		if (acl.backendName) {
			confStr +=
				'\n' +
				`acl host_${acl.backendName} hdr_dom(host) -i ${acl.domain}\n` +
				`use_backend ${acl.backendName} if host_${acl.backendName}\n`;
		}
		confStr += acl.clientTimeout ? `timeout client ${acl.clientTimeout}\n` : '';
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
	port: string,
	crtPath: string,
): string => {
	const aclGenerator = (frontends: InternalFrontendEntry[]): string => {
		return _.map(frontends, acl => {
			let entryStr = '';
			if (acl.backendName) {
				entryStr =
					'\n' +
					`acl host_${acl.backendName} hdr_dom(host) -i ${acl.domain}\n` +
					`use_backend ${acl.backendName} if host_${acl.backendName}\n`;
			}
			entryStr += acl.clientTimeout
				? `timeout client ${acl.clientTimeout}\n`
				: '';
			return entryStr;
		}).join('');
	};
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
		confStr += statsGenerator(configuration['frontend']['https'][port]);
		confStr += aclGenerator(configuration['frontend']['https'][port]);
	} else {
		confStr +=
			`\nfrontend https_${port}_in\n` +
			'mode http\n' +
			`bind *:${port} ssl crt ${crtPath}\n` +
			'reqadd X-Forwarded-Proto:\\ https\n';
		confStr += statsGenerator(configuration['frontend']['https'][port]);
		confStr += aclGenerator(configuration['frontend']['https'][port]);
	}

	return confStr;
};

const updateCertChain = (chain: string, cert: string): string =>
	chain.includes(cert) ? chain : chain.concat(cert);

// Populate configuration internal representation from input
export async function GenerateHaproxyConfig(
	config: Configuration,
	configOutputPath: string,
	certOutputPath: string,
): Promise<void> {
	const generatedDomains: string[] = [];
	const domainPrefix =
		process.env.DOMAIN_INC_UUID === 'true'
			? `${process.env.BALENA_DEVICE_UUID}.`
			: '';
	const generateCerts = process.env.AUTOGENERATE_CERTS === 'true';
	let certificateGenerator: Promise<string> | undefined;

	await Bluebird.map(_.toPairs(config), ([key, value]) => {
		const backendName = value.backend ? key + '_backend' : '';
		_.forEach(value['frontend'], frontend => {
			// Decompose synthetic proto:domain:port objects.
			const proto = _.get(frontend, 'protocol');
			const subdomain = _.get(frontend, 'subdomain');
			const tld = _.get(frontend, 'domain');
			const prefixedTld = `${domainPrefix}${tld}`;
			const domain = subdomain ? `${subdomain}.${prefixedTld}` : prefixedTld;
			const port = _.get(frontend, 'port');
			const clientTimeout = frontend.clientTimeout;
			const details: InternalFrontendEntry = {
				domain,
				backendName,
				clientTimeout,
				stats: _.get(frontend, 'stats'),
			};

			if (_.get(configuration['frontend'], proto)) {
				if (_.get(configuration['frontend'][proto], port)) {
					configuration['frontend'][proto][port] = configuration['frontend'][
						proto
					][port].concat([details]);
				} else {
					configuration['frontend'][proto][port] = [details];
				}
			} else {
				configuration['frontend'][proto] = {
					[port]: [details],
				};
			}
			const frontendCrt = _.get(frontend, 'crt');
			// If a certificate entry exists, add that to the chain.
			if (frontendCrt) {
				fullChain = updateCertChain(fullChain, frontendCrt);
			} else {
				// If a certificate entry does not exist, we're going to make the
				// assumption that a LE certificate for all subdomains (and the
				// devices domain) is required. We'll keep a map of domains to ensure
				// that they're all the same. If not, we'll throw an error as for
				// the moment we shouldn't be creating multi-domain LBs.
				// We also don't support '*' domains, as these are implied to
				// be specific port/non-HTTPS bindings.
				if (
					generateCerts &&
					!_.includes(generatedDomains, prefixedTld) &&
					tld !== '*'
				) {
					// Multi LB for HAProxy is not yet valid
					if (generatedDomains.length !== 0) {
						throw new Error(
							'Cannot use more than one domain for generated certificates',
						);
					}
					generatedDomains.push(prefixedTld);

					certificateGenerator = GenerateCertificate(prefixedTld);
				}
			}
		});

		_.forEach(value['backend'], backend => {
			let [proto, domain, port] = _.split(backend['url'], ':');
			domain = domain.replace(/^\/\//g, '');
			const backendDetails = {
				proto,
				port,
				backend: domain,
				server: _.get(backend, 'server'),
			};
			if (!_.has(configuration['backend'], backendName)) {
				configuration['backend'][backendName] = [backendDetails];
			} else {
				if (
					!_.some(
						configuration['backend'][backendName],
						i => i.proto === proto && i.port === port && i.backend === domain,
					)
				) {
					configuration['backend'][backendName] = configuration['backend'][
						backendName
					].concat(backendDetails);
				}
			}
		});
	});

	const generatedChain = await certificateGenerator;
	if (generatedChain) {
		fullChain = updateCertChain(fullChain, generatedChain);
	}

	_.forEach(configuration['frontend'], (protoValue, proto) => {
		_.forEach(protoValue, (_portValue, port) => {
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

	// Store HAProxy configuration to file.
	await mzfs.writeFile(
		configOutputPath,
		configurationString + configurationBackendStr,
	);

	await mzfs.writeFile(certOutputPath, fullChain);
}
