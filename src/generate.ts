#!/usr/bin/env node
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
import { GenerateHaproxyConfig } from './generate-haproxy-cfg';
import { LoadFromFile } from './utils';
const capitano = require('capitano');

const help = () => {
	console.log(`Usage: generate [COMMANDS] [OPTIONS]`);
	console.log('\nCommands:\n');

	for (let command of capitano.state.commands) {
		if (command.isWildcard()) continue;
		console.log(`\t${command.signature}\t\t\t${command.description}`);
	}
};

capitano.command({
	signature: 'help',
	description: 'output general help page',
	action: help,
});

capitano.command({
	signature: 'config',
	description: 'Configuration file path',
	options: [
		{
			signature: 'envvar',
			parameter: 'envvar',
			alias: ['e'],
			required: false,
		},
		{
			signature: 'file',
			parameter: 'file',
			alias: ['f'],
			required: false,
		},
		{
			signature: 'outputCert',
			parameter: 'outputCert',
			alias: ['p'],
			required: false,
		},
		{
			signature: 'outputConfig',
			parameter: 'outputConfig',
			alias: ['c'],
			required: false,
		},
	],
	action: (_params: any, options: any) => {
		const {
			envvar,
			file = '/.balena/config.json',
			outputCert = '/etc/ssl/private/haproxy.cert.chain.pem',
			outputConfig = '/usr/local/etc/haproxy/haproxy.cfg',
		} = options;
		let processConfig;
		if (envvar && (processConfig = process.env[envvar])) {
			let config = JSON.parse(processConfig);
			return GenerateHaproxyConfig(config, outputConfig, outputCert);
		} else if (envvar) {
			throw new Error('Could not find environment variable: ' + envvar);
		} else {
			return LoadFromFile(file).then(config => {
				return GenerateHaproxyConfig(config, outputConfig, outputCert);
			});
		}
	},
});

capitano.run(process.argv, (err: Error) => {
	if (err != null) {
		help();
		console.error(err.stack);
		process.exit(1);
	}
});
