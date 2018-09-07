'use strict'

const lint = require('mocha-eslint')

const paths = [
	'generate-haproxy-cfg.js',
]

const options = {
	formatter: 'compact',
	alwaysWarn: true,
	timeout: 5000,
	slow: 1000,
	strict: true,
	contextName: 'eslint',
}

// Run the tests
lint(paths, options)
