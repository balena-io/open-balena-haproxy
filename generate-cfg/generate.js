#!/usr/bin/env node

const generateHaproxyConfig = require('./generate-haproxy-cfg').generateHaproxyConfig
const capitano = require('capitano')
const loadFromFile = require('./utils').loadFromFile

const help = (params, options) => {
	console.log(`Usage: generate [COMMANDS] [OPTIONS]`)
	console.log('\nCommands:\n')

	for (let command of capitano.state.commands) {
		if (command.isWildcard()) continue
		console.log(`\t${command.signature}\t\t\t${command.description}`)
	}
}

capitano.command({
	signature: 'help',
	description: 'output general help page',
	action: help
})

capitano.command({
	signature: 'config',
	description: 'Configuration file path',
	options: [{
		signature: 'envvar',
		parameter: 'envvar',
		alias: [ 'e' ],
		required: false
	}, {
		signature: 'file',
		parameter: 'file',
		alias: [ 'f' ],
		required: false
	}, {
		signature: 'outputCert',
		parameter: 'outputCert',
		alias: [ 'p' ],
		required: false
	}, {
		signature: 'outputConfig',
		parameter: 'outputConfig',
		alias: [ 'c' ],
		required: false
	}],
	action: (params, options) => {
		const {
			envvar,
			file = '/.balena/config.json',
			outputCert = '/etc/ssl/private/haproxy.cert.chain.pem',
			outputConfig = '/usr/local/etc/haproxy/haproxy.cfg'
		} = options
		if (envvar && process.env[envvar]){
			let config = JSON.parse(process.env[envvar])
			return generateHaproxyConfig(
				config,
				outputConfig,
				outputCert
			)
		}
		else if (envvar){
			throw new Error("Could not find environment variable: " + envvar)
		}
		else {
			return loadFromFile(file).then(config => {
				return generateHaproxyConfig(
					config,
					outputConfig,
					outputCert
				)
			})
		}
	}
})

capitano.run(process.argv, (err) => {
	if (err != null) {
		help()
		console.error(err.stack)
		process.exit(1)
	}
})

