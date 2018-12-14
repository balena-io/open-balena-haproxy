Balena HAProxy
==============

HA proxy component for resin environments (bob, onprem, etc)

This container expects a config.json file, mounted in `/.balena/config.json`
and builds the corresponding haproxy.config and certificate files.

Alternatively, the `PROXY_CONFIG` envvar containing the JSON config may be passed
to the container instead.

An example such file covering all functionality, may be found [here](./generate-cfg/test/fixtures/cfg.json)

`CONFD_BACKEND` should be set to `ENV`.

## Certificate Autogeneration

Certificate autogeneration can now be achieved via the use of a client library
(balena-certificate-dns-client) to retrieve Let's Encrypt certificates for the
device running this component. This will also create A records for the appropriate
domain to point at the local environment.

The required envvars are:

`BALENA_DEVICE_UUID` - Overrides any locally found device UUID, used for specific device
    naming. If not present, the local device UUID will be used instead (if available)
`DOMAIN_INC_UUID` - If set, will prefix any found device UUID (or `BALENA_DEVICE_UUID`) to
    the domain passed in the config
`AUTOGENERATE_CERTS` - If `true`, will attempt to autogenerate certificates
`AUTH_TOKEN`[Autogenerated Certificates] - A valid Balena usertoken, with either agent
    support or admin rights
`CERT_SERVICE_HOST`[Autogenerated Certificates] - The host of the DNS client service, in
     a `<protocol>/<address>` format
`CERT_SERVICE_PORT`[Autogenerated Certificates] - The port the DNS client service is
    running on, eg. `5678`
`CERT_SERVICE_DIR`[Autogenerated Certificates] - The location where certificates should be
    stored, eg. `/usr/src/app/certificates` (note this is not the final location which
    HAProxy uses)
`STATIC_DNS_IP`[Autogenerated Certificates] - If set, will use a static IP for the DNS
    entry set, rather than attempting to discover it from the device

When attempting to dynamically acquire both device UUID and IP address, the
`BALENA_SUPERVISOR_ADDRESS` and `BALENA_SUPERVISOR_API_KEY` are acquired from the running
container to offer this functionality.
