import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { createConfig, lint } from '@redocly/openapi-core';
import { businessPaths } from '../apps/indexer/api/domain.ts';
import type { AnySchemaObject, ValidateFunction } from 'ajv';

type ObjectValue = Record<string, any>;
export const specPath = fileURLToPath(new URL('../docs/api/openapi.yaml', import.meta.url));
export const specification = parse(readFileSync(specPath, 'utf8')) as ObjectValue;
const ajv = new Ajv2020({ allErrors: true, strict: false, coerceTypes: false });
ajv.addKeyword({
  keyword: 'x-maximum-decimal', schemaType: 'string', type: 'string',
  validate: (maximum: string, value: string) => value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= BigInt(maximum),
});
const compiled = new Map<string, ValidateFunction>();
export function dereference(object: ObjectValue): ObjectValue {
  while (object.$ref) {
    assert.match(object.$ref, /^#\//, 'Only checked-in local references are allowed');
    object = object.$ref.slice(2).split('/').reduce((value: ObjectValue, key: string) => value[key.replace(/~1/g, '/').replace(/~0/g, '~')], specification);
  }
  return object;
}
export function schemaValidator(schema: AnySchemaObject) {
  const key = JSON.stringify(schema);
  let validate = compiled.get(key);
  if (!validate) {
    validate = ajv.compile({ components: specification.components, ...schema });
    compiled.set(key, validate);
  }
  return validate;
}
export function assertApiResponse(path: string, status: number, body: unknown, cacheControl = 'no-store') {
  const response = dereference(specification.paths[path].get.responses[String(status)]);
  assert(response, `Undocumented response ${path} ${status}`);
  const validate = schemaValidator(response.content['application/json'].schema);
  assert(validate(body), `${path} ${status}: ${ajv.errorsText(validate.errors)}`);
  assert.equal(cacheControl, response.headers['Cache-Control'].schema.const);
}
export async function checkSpecification() {
  const config = await createConfig({ extends: ['spec'] });
  const problems = await lint({ ref: specPath, config });
  assert.equal(problems.length, 0, JSON.stringify(problems.map(p => ({ rule: p.ruleId, message: p.message }))));
  assert.equal(specification.openapi, '3.1.0');
  assert.deepEqual(Object.keys(specification.paths).sort(), [...businessPaths].sort());
  let examples = 0;
  for (const [path, item] of Object.entries(specification.paths) as [string, ObjectValue][]) {
    assert.deepEqual(Object.keys(item), ['get']);
    for (const [status, reference] of Object.entries(item.get.responses) as [string, ObjectValue][]) {
      const response = dereference(reference);
      for (const sample of Object.values(response.content['application/json'].examples) as ObjectValue[]) {
        assertApiResponse(path, Number(status), dereference(sample).value);
        examples++;
      }
    }
  }
  for (const [name, value] of [
    ['PositiveUint256String', '0'], ['PositiveUint256String', '01'], ['PositiveUint256String', 9007199254740992],
    ['PositiveUint256String', (1n << 256n).toString()], ['UnixSecondsString', (1n << 64n).toString()], ['EffectiveStatus', 'Frozen'],
  ]) assert.equal(schemaValidator({ $ref: `#/components/schemas/${name}` })(value), false);
  console.log(`OpenAPI valid: three GET routes, ${examples} response-example uses, six invalid fixtures rejected.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkSpecification();
