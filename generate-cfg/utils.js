'use strict'

const Promise = require('bluebird')
const { readFileAsync } = Promise.promisifyAll(require('fs'))

/**
 * Loads json object from file
 * @param filePath: Path to json file
 * @returns {Bluebird<object>}
 */
const loadFromFile = (filePath) => {
	return readFileAsync(filePath, 'utf8')
		.then(JSON.parse)
}
module.exports.loadFromFile = loadFromFile
