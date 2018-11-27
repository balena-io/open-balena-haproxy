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
});
