# open-balena-haproxy
> based on [official image](https://hub.docker.com/_/haproxy)

## features

* provides reverse proxy service(s) for devices running balenaOS
* includes configuration for balena-on-balena
* monitors `/certs/open-balena.pem` for changes and restarts automatically
* builds certificate chain passed using the following environment variables

```
HAPROXY_CRT: base64 encoded x590 server certificate (public key)
HAPROXY_KEY: base64 encodedservice private key
ROOT_CA: certificate authority x509 certificate chain
```

* supports custom configuration by overriding `haproxy.cfg` and/or `Dockerfile`
