'use strict'
const generateHaproxyConfig = require('../generate-haproxy-cfg').generateHaproxyConfig
const restructureConfig = require('../restructureConfig')
const { assertFilesEqual, loadConfigFromFile } = require('./testUtils')
const assert = require('chai').assert

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

it('Test restructureConfig', () => {
	return loadConfigFromFile('./test/fixtures/cfg.json').then(config => {
		// console.log(config)
		process.env.RESIN_DEVICE_UUID = 'abcdefghijklmnop'
		let actual = restructureConfig(config)
		return loadConfigFromFile('./test/outputs/restructuredConfig.json').then(expected => {
			return assert.deepEqual(actual, expected)
		})
	})
})