/*
Copyright 2018 Balena Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import * as Bluebird from 'bluebird';
import * as rootPath from 'app-root-path';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { execSync } from 'child_process';
import 'mocha';
import * as temp from 'temp';

import { GenerateHaproxyConfig } from '../src/generate-config';
import { LoadConfigFromFile, LoadFromFile, ReplacePairs } from './test-utils';

// Ensure Chai is correctly initialised
chai.use(chaiAsPromised);
const { should } = chai.should();
should.exist;

// Ensure temp directories are cleaned up after tests end
temp.track();

describe('HAProxy Configuration Generation', () => {
	function loadFiles(files: string[]): Bluebird<string[]> {
		return Bluebird.map(files, file => {
			return LoadFromFile(file);
		});
	}

	it('should generate a valid HAProxy config from a template', () => {
		return Bluebird.fromCallback<string>(cb => {
			return temp.mkdir('haproxy-tests', cb);
		}).then(tempDir => {
			return LoadConfigFromFile(`${rootPath}/test/fixtures/cfg.json`).then(
				config => {
					return GenerateHaproxyConfig(
						config,
						`${tempDir}/output`,
						`${tempDir}/chain.pem`,
					)
						.then(() => {
							return loadFiles([
								`${tempDir}/output`,
								`${rootPath}/test/outputs/output-config`,
							]);
						})
						.then(files => {
							const testConfFile = files[0];
							const refConfFile = ReplacePairs(files[1], [
								{ key: 'tmp', value: tempDir },
							]);

							testConfFile.should.deep.equals(refConfFile);
						})
						.then(() => {
							return loadFiles([
								`${tempDir}/chain.pem`,
								`${rootPath}/test/outputs/output-chain.pem`,
							]);
						})
						.then(files => {
							const testCertFile = files[0];
							const refCertFile = files[1];

							testCertFile.should.deep.equals(refCertFile);
						});
				},
			);
		});
	});

	it('should generate a valid HAProxy config from a set of envvars', () => {
		return Bluebird.fromCallback<string>(cb => {
			return temp.mkdir('haproxy-tests', cb);
		}).then(tempDir => {
			const configOne =
				'ewogICAgImRlZmF1bHRzIjogWwogICAgICAgICJ0aW1lb3V0IGNvbm5lY3QgNTAwMCIsCiAgICAgICAgInRpbWVvdXQgY2xpZW50IDYwMDAwIiwKICAgICAgICAidGltZW91dCBzZXJ2ZXIgNjAwMDAiLAogICAgICAgICJkZWZhdWx0LXNlcnZlciBpbml0LWFkZHIgbm9uZSIKICAgIF0sCiAgICAiZmlyc3QiOiB7CiAgICAgICAgImJhY2tlbmQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ1cmwiOiAiaHR0cDovL2ZpcnN0OjgwIiwKICAgICAgICAgICAgICAgICJzZXJ2ZXIiOiB7CiAgICAgICAgICAgICAgICAgICAgImNoZWNrIjogbnVsbCwKICAgICAgICAgICAgICAgICAgICAicG9ydCI6ICI8cG9ydD4iCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KICAgICAgICBdLAogICAgICAgICJmcm9udGVuZCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICAgInByb3RvY29sIjogImh0dHAiLAogICAgICAgICAgICAgICAgImRvbWFpbiI6ICJ0ZXN0LmRvbWFpbiIsCiAgICAgICAgICAgICAgICAic3ViZG9tYWluIjogImZpcnN0IiwKICAgICAgICAgICAgICAgICJwb3J0IjogIjgwIgogICAgICAgICAgICB9CiAgICAgICAgXQogICAgfSwKICAgICJzZWNvbmQiOiB7CiAgICAgICAgImJhY2tlbmQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJ1cmwiOiAiaHR0cDovL3NlY29uZDo4MCIsCiAgICAgICAgICAgICAgICAic2VydmVyIjogewogICAgICAgICAgICAgICAgICAgICJjaGVjayI6IG51bGwsCiAgICAgICAgICAgICAgICAgICAgInBvcnQiOiAiPHBvcnQ+IgogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9CiAgICAgICAgXSwKICAgICAgICAiZnJvbnRlbmQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJwcm90b2NvbCI6ICJodHRwIiwKICAgICAgICAgICAgICAgICJkb21haW4iOiAidGVzdC5kb21haW4iLAogICAgICAgICAgICAgICAgInN1YmRvbWFpbiI6ICJzZWNvbmQiLAogICAgICAgICAgICAgICAgInBvcnQiOiAiODAiCiAgICAgICAgICAgIH0KICAgICAgICBdCiAgICB9Cn0K';
			const configTwo =
				'ewogICAgInRoaXJkIjogewogICAgICAgICJiYWNrZW5kIjogWwogICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAidXJsIjogImh0dHA6Ly90aGlyZDo4MCIsCiAgICAgICAgICAgICAgICAic2VydmVyIjogewogICAgICAgICAgICAgICAgICAgICJjaGVjayI6IG51bGwsCiAgICAgICAgICAgICAgICAgICAgInBvcnQiOiAiPHBvcnQ+IgogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9CiAgICAgICAgXSwKICAgICAgICAiZnJvbnRlbmQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJwcm90b2NvbCI6ICJodHRwIiwKICAgICAgICAgICAgICAgICJkb21haW4iOiAidGVzdC5kb21haW4iLAogICAgICAgICAgICAgICAgInN1YmRvbWFpbiI6ICJ0aGlyZCIsCiAgICAgICAgICAgICAgICAicG9ydCI6ICI4MCIKICAgICAgICAgICAgfQogICAgICAgIF0KICAgIH0sCiAgICAiZm91cnRoIjogewogICAgICAgICJiYWNrZW5kIjogWwogICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAidXJsIjogImh0dHA6Ly9mb3VydGg6ODAiLAogICAgICAgICAgICAgICAgInNlcnZlciI6IHsKICAgICAgICAgICAgICAgICAgICAiY2hlY2siOiBudWxsLAogICAgICAgICAgICAgICAgICAgICJwb3J0IjogIjxwb3J0PiIKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQogICAgICAgIF0sCiAgICAgICAgImZyb250ZW5kIjogWwogICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAicHJvdG9jb2wiOiAiaHR0cCIsCiAgICAgICAgICAgICAgICAiZG9tYWluIjogInRlc3QuZG9tYWluIiwKICAgICAgICAgICAgICAgICJzdWJkb21haW4iOiAiZm91cnRoIiwKICAgICAgICAgICAgICAgICJwb3J0IjogIjgwIgogICAgICAgICAgICB9CiAgICAgICAgXQogICAgfQp9Cg==';
			const configThree =
				'ewogICAgImZpZnRoIjogewogICAgICAgICJiYWNrZW5kIjogWwogICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAidXJsIjogImh0dHA6Ly9maWZ0aDo4MCIsCiAgICAgICAgICAgICAgICAic2VydmVyIjogewogICAgICAgICAgICAgICAgICAgICJjaGVjayI6IG51bGwsCiAgICAgICAgICAgICAgICAgICAgInBvcnQiOiAiPHBvcnQ+IgogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9CiAgICAgICAgXSwKICAgICAgICAiZnJvbnRlbmQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICJwcm90b2NvbCI6ICJodHRwIiwKICAgICAgICAgICAgICAgICJkb21haW4iOiAidGVzdC5kb21haW4iLAogICAgICAgICAgICAgICAgInN1YmRvbWFpbiI6ICJmaWZ0aCIsCiAgICAgICAgICAgICAgICAicG9ydCI6ICI4MCIKICAgICAgICAgICAgfQogICAgICAgIF0KICAgIH0KfQo=';

			const command =
				`TEST_CONFIG=${configOne} TEST_CONFIG_1=${configTwo} TEST_CONFIG_2=${configThree} ` +
				`${process.cwd()}/bin/generate-config config -e TEST_CONFIG ` +
				`-p ${tempDir}/chain.pem -c ${tempDir}/output`;

			// A horrible sync is the simplest thing to do.
			execSync(command);

			return loadFiles([
				`${tempDir}/output`,
				`${rootPath}/test/outputs/envvar-output-config`,
			]).then(files => {
				const testConfigFile = files[0];
				const refConfigFile = files[1];

				testConfigFile.should.deep.equals(refConfigFile);
			});
		});
	}).timeout(10000);
});
