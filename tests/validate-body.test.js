const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlainObject,
  requireStringField,
  requireObjectField,
} = require('../src/middleware/validate-body');

test('isPlainObject validates object-like values', () => {
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject('x'), false);
});

test('requireStringField enforces type and bounds', () => {
  assert.equal(requireStringField({ x: 'abc' }, 'x', { min: 1, max: 5 }).ok, true);
  assert.equal(requireStringField({ x: '' }, 'x', { min: 1 }).ok, false);
  assert.equal(requireStringField({ x: 1 }, 'x').ok, false);
  assert.equal(requireStringField({ x: 'abcdef' }, 'x', { max: 3 }).ok, false);
});

test('requireObjectField validates plain object payloads', () => {
  assert.equal(requireObjectField({ o: { a: 1 } }, 'o').ok, true);
  assert.equal(requireObjectField({ o: {} }, 'o', { allowEmpty: false }).ok, false);
  assert.equal(requireObjectField({ o: [] }, 'o').ok, false);
});
