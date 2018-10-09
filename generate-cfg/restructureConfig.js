'use strict'

const _ = require('lodash')

module.exports = (config) => {
	const uuid = process.env.RESIN_DEVICE_UUID
	if (uuid) config = injectUUIDtoDomains(config, uuid)
	return config
}

const injectUUIDtoDomains = (config, uuid) => {
	_.forEach(config, (value) => {
		_.forEach(_.get(value, 'frontend', []), (frontend)=> {
			if (_.get(frontend, 'domain') && ['http', 'https'].includes(_.get(frontend, 'protocol'))){
				frontend['domain'] = uuid + '.' + frontend['domain']
			}
		})
	})
	return config
}
