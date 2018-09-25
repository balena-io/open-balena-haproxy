'use strict'
const { assert } = require('chai')
const Promise = require('bluebird')
const { readFileAsync } = Promise.promisifyAll(require('fs'))

const loadFromFile = (filePath) => {
	return readFileAsync(filePath, 'utf8')
}

const loadConfigFromFile = (filePath) => {
	return readFileAsync(filePath, 'utf8')
		.then(JSON.parse)
}

const assertFilesEqual = (path1, path2) => {
	return loadFromFile(path1).then((obj1) => {
		return loadFromFile(path2).then(obj2 => {
			return assert.deepEqual(obj1, obj2)
		})
	})
}

module.exports.loadConfigFromFile = loadConfigFromFile
module.exports.assertFilesEqual = assertFilesEqual
module.exports.loadFromFile = loadFromFile