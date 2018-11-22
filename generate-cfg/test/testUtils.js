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

const assertFilesEqual = (testFile, refFile, replacePairs) => {
	// This currently assumes both files are text
	// Replace any instances of replacePairs keys with the associted values
	return loadFromFile(refFile).then((data) => {
		let obj1 = data
		if (replacePairs) {
			replacePairs.forEach(item => {
				obj1 = obj1.replace(new RegExp(`{{${item.key}}}`, 'gm'), item.value)
			})
		}
		return loadFromFile(testFile).then(obj2 => {
			return assert.deepEqual(obj1, obj2)
		})
	})
}

module.exports.loadConfigFromFile = loadConfigFromFile
module.exports.assertFilesEqual = assertFilesEqual
module.exports.loadFromFile = loadFromFile