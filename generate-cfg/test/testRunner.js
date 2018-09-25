'use strict'
const generateHaproxyConfig = require('../generate-haproxy-cfg').generateHaproxyConfig
const { assertFilesEqual, loadConfigFromFile } = require('./testUtils')

it('Test generate-haproxy', () => {
	return loadConfigFromFile('./test/fixtures/cfg.json').then(config => {
		return generateHaproxyConfig(
			config,
			'/tmp/output',
			'/tmp/chain.pem'
		)
			.then(() =>{
				return assertFilesEqual(
					'/tmp/output',
					'./test/outputs/output-config'
				)
			})
			.then(() =>{
				return assertFilesEqual(
					'/tmp/chain.pem',
					'./test/outputs/output-chain.pem'
				)
			})
			.finally(() => {
				// return execAsync('rm -rf /tmp/output.json /tmp/chain.pem')
			})
	})
})
