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
import * as _ from 'lodash';

import { Configuration, GenerateHaproxyConfig } from './generate-config';
import { LoadJSONFile } from './utils';
const capitano = require('capitano');

interface CommandOptions {
	file?: string;
	envvar?: string;
	'output-cert'?: string;
	'output-config'?: string;
}

const help = () => {
	console.log(`Usage: config [COMMANDS] [OPTIONS]`);
	console.log('\nCommands:\n');

	for (let command of capitano.state.commands) {
		if (command.isWildcard()) continue;
		console.log(`\t${command.signature}\t${command.description}`);
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
			signature: 'output-cert',
			parameter: 'output-cert',
			alias: ['p'],
			required: false,
		},
		{
			signature: 'output-config',
			parameter: 'output-config',
			alias: ['c'],
			required: false,
		},
	],
	action: (_params: null, commandOptions: CommandOptions) => {
		const envvar = commandOptions.envvar;
		const file = commandOptions.file || `${process.cwd()}/.balena/config.json`;
		const outputCert =
			commandOptions['output-cert'] ||
			'/etc/ssl/private/haproxy.cert.chain.pem';
		const outputConfig =
			commandOptions['output-config'] || '/usr/local/etc/haproxy/haproxy.cfg';
		let processConfig;
		if (envvar && (processConfig = process.env[envvar])) {
			// It's entirely possible the encoded HAProxy config is too large to fit
			// in a single envvar (see MAX_ARG_STRLEN, which by default has a kernel
			// argument limit of 128K). Because of this, we instead allow configs to
			// be split into multiple chunked objects which are joined together.
			// The subsequent envvars must be named `<prefix>_<x>` where <prefix>
			// is the original `envvar` key, and <x> should be a number starting at
			// '1' and incrementing for each extra config partial.
			let finalConfig = {};
			let configCounter = 1;
			while (processConfig) {
				_.assign(
					finalConfig,
					JSON.parse(Buffer.from(processConfig, 'base64').toString()),
				);
				processConfig = process.env[`${envvar}_${configCounter++}`];
			}

			return GenerateHaproxyConfig(finalConfig, outputConfig, outputCert);
		} else if (envvar) {
			throw new Error('Could not find environment variable: ' + envvar);
		} else {
			return LoadJSONFile<Configuration>(file).then(config => {
				return GenerateHaproxyConfig(config, outputConfig, outputCert);
			});
		}
	},
});

capitano.run(process.argv, (err: Error) => {
	if (err != null) {
		help();
		console.error(err.stack);
		process.exitCode = 1;
	}
});
