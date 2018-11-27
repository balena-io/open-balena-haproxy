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
import { readFile } from 'fs';
import { URL } from 'url';

import { Configuration } from '../src/generate-config';

const readFileAsync: (
	path: string | number | Buffer | URL,
	options?: {},
) => Bluebird<Buffer | string> = Bluebird.promisify(readFile);

export interface TemplatePair {
	key: string;
	value: string;
}

export function ReplacePairs(
	data: string,
	replacePairs: TemplatePair[],
): string {
	let newString = data;
	replacePairs.forEach(item => {
		newString = newString.replace(
			new RegExp(`{{${item.key}}}`, 'gm'),
			item.value,
		);
	});

	return newString;
}

export function LoadFromFile(filePath: string): Bluebird<string> {
	return readFileAsync(filePath, 'utf8') as Bluebird<string>;
}

export function LoadConfigFromFile(filePath: string): Bluebird<Configuration> {
	return readFileAsync(filePath, 'utf8').then(JSON.parse);
}
