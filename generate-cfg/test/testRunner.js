'use strict'
const generateHaproxyConfig = require('../generate-haproxy-cfg').generateHaproxyConfig
const { assertFilesEqual } = require('./testUtils')
const Promise = require('bluebird')
const execAsync = Promise.promisify(require('child_process').exec)

it('Test generate-haproxy', () => {
	return generateHaproxyConfig(
		'./test/fixtures/cfg.json',
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
			return execAsync('rm -rf /tmp/output.json /tmp/chain.pem')
		})
})
