HA proxy component for resin environments (bob, onprem, etc)

This container expects a config.json file, mounted in `/.balena/config.json`
and builds the corresponding haproxy.config and certificate files.

An example such file covering all functionality, may be found [here](./test/fixtures/cfg.json)
