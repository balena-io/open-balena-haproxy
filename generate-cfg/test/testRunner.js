'use strict'
const Bluebird = require('bluebird')
const rootPath = require('app-root-path')
const temp = require('temp').track()

const generateHaproxyConfig = require('../generate-haproxy-cfg').generateHaproxyConfig
const { assertFilesEqual, loadConfigFromFile } = require('./testUtils')

it('Test generate-haproxy', () => {
	return Bluebird.fromCallback(cb => {
		return temp.mkdir('haproxy-tests', cb)
	}).then(tempDir => {
		return loadConfigFromFile(`${rootPath}/generate-cfg/test/fixtures/cfg.json`).then(config => {
			return generateHaproxyConfig(
				config,
				`${tempDir}/output`,
				`${tempDir}/chain.pem`
			).then(() =>{
				return assertFilesEqual(
					`${tempDir}/output`,
					`${rootPath}/generate-cfg/test/outputs/output-config`,
					[
						{ key: 'tmp', value: tempDir }
					]
				)
			}).then(() =>{
				return assertFilesEqual(
					`${tempDir}/chain.pem`,
					`${rootPath}/generate-cfg/test/outputs/output-chain.pem`
				)
			})
		})
	})
})
