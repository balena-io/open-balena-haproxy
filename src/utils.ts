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
import * as Bluebird from 'bluebird';
import {
	BalenaCertificateClient,
	CertificateClientErrorCodes,
	CertificateResult,
} from 'balena-certificate-client';
import * as mzfs from 'mz/fs';
import { sep } from 'path';
import * as request from 'request-promise';

interface DeviceDetails {
	api_port: string;
	ip_address: string;
	os_version: string;
	supervisor_version: string;
	update_pending: boolean;
	update_failed: boolean;
	update_downloaded: boolean;
	commit: string;
	status: string;
	download_progress: string | null;
}

/**
 * Loads JSON object from file
 *
 * @param filePath: Path to json file
 *
 * @returns A parsed JSON object.
 */
export function LoadJSONFile(filePath: string): PromiseLike<{}> {
	return mzfs.readFile(filePath, 'utf8').then(JSON.parse);
}

/**
 * Generates a new client certificate chain for a TLD utilising
 * the Balena Certificate Client (via Let's Encrypt).
 * The TLD will be augmented to ensure wildcards for that domain are
 * included in the CN, and that a wildcard SAN prefixed with `devices`
 * is present.
 *
 * Any returned certificate will be stored in a subdirectory named
 * after the TLD, based on the CERT_SERVICE_DIR envvar.
 *
 * Should a valid certificate already exist, then no new certificate
 * shall be generated (this relies on Greenlock's validity testing).
 * This means that this is safe to call on each startup, without
 * generating a new certificate.
 *
 * @param domain - The Top Level Domain of the certificate to generate.
 *
 * @returns A PEM chain in string form suitable for use by HAProxy.
 */
export async function GenerateCertificate(domain: string): Promise<string> {
	const authToken = process.env.AUTH_TOKEN;
	const dnsUpdateHost = process.env.CERT_SERVICE_HOST;
	const dnsUpdatePort = parseInt(process.env.CERT_SERVICE_PORT || '0', 10);
	const configRoot = process.env.CERT_SERVICE_DIR;
	const domainCertDir = `${configRoot}/${domain}`;
	let renewing = true;

	// Need to ensure we have everything before contacting the service.
	if (!authToken) {
		throw new Error(
			'Unable to generate new certificate, require an auth token',
		);
	}
	if (!dnsUpdateHost || !dnsUpdatePort) {
		throw new Error('No certificate service host or port has been specified');
	}
	if (!configRoot) {
		throw new Error('A certificate configuration directory is required');
	}

	// Either use the given static IP address in the envvars, or try and determine
	// it from the balena device itself.
	let ip = process.env.STATIC_DNS_IP;
	if (!ip) {
		let deviceDetails: DeviceDetails;
		try {
			deviceDetails = await request({
				uri: `${process.env.BALENA_SUPERVISOR_ADDRESS}/v1/device?apikey=${
					process.env.BALENA_SUPERVISOR_API_KEY
				}`,
				json: true,
				method: 'GET',
			}).promise();
		} catch (_err) {
			throw new Error(
				'Could not acquire IP address, is this is a Balena device?',
			);
		}

		ip = deviceDetails.ip_address;
	}

	// Carry out an initial test to see if the certificates already exist.
	// If they do, then this is a renewal rather than a set of new certs.
	// The request itself will verify whether there needs to be a request at
	// all. If there does not, we return.
	// Generate new certificate
	const certClient = new BalenaCertificateClient({
		dnsUpdateHost,
		dnsUpdatePort,
		authToken,
		configRoot,
	});

	// Determine if the certificate already exists by checking the config directories
	// and looking for a relevant certificate for this UUID. If it does exist,
	// we need to renew instead of requesting a new certificate.
	try {
		await Bluebird.map(['certificate.pem', 'ca.pem', 'private-key.pem'], file =>
			mzfs.access(`${domainCertDir}${sep}${file}`),
		).catch({ code: 'ENOENT' }, () => (renewing = false));
	} catch (err) {
		throw new Error('Could not determine if certificate files pre-exist');
	}

	// Attempt to retrieve new certificates from the service.
	let certResults: CertificateResult | null = null;
	try {
		certResults = await certClient.requestCertificate({
			domain,
			subdomains: ['*', '*.devices', '*.s3'],
			ip,
			email: 'spam@whaleway.net',
			//email: 'spam@whaleway.net', <-- Need a valid balena email addy
			renewing,
			outputLocation: domainCertDir,
		});
	} catch (err) {
		// If anything but a pre-existing certificate exists, throw.
		if (err.code !== CertificateClientErrorCodes.EXISTING_CERTIFICATE) {
			throw new Error(`Could not generate certificate:\n${err.message}`);
		}
	}

	// We load the certificates from the config volume and use those instead,
	// storing into a local object first. This can then be used by the rest
	// of the system.
	const fileMap = new Map<keyof CertificateResult, string>([
		['certificate', 'certificate'],
		['ca', 'ca'],
		['privateKey', 'private-key'],
	]);
	if (!certResults) {
		let fileResults: Partial<CertificateResult> = {};
		try {
			await Bluebird.map(fileMap, async entry => {
				const key = entry[0];
				const file = entry[1];

				fileResults[key] = await mzfs.readFile(
					`${domainCertDir}${sep}${file}.pem`,
					'utf8',
				);
			});
		} catch (err) {
			throw new Error('Could not read certificates from local filestore');
		}
		certResults = fileResults as CertificateResult;
	}

	// We append the EEC, CA and private key together
	return `${certResults.certificate}${certResults.ca}${certResults.privateKey}`;
}
