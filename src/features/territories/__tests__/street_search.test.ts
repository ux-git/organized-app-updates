import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchStreets,
  streetsOf,
  streetTerritories,
  streetWords,
  territoryKey,
} from '../street_search';

const INDEX = {
  Rheinstraße: ['M12', 'M14'],
  'Rheinberger Straße': ['M16'],
  Rheinallee: ['N10'],
  'Wiener Straße': ['M01'],
  'Konrad-Adenauer-Straße': ['O3'],
  'Am Rheintor': ['M05'],
  Öttinger: ['S1'],
  Bahnhofstr: ['M12'],
};

const names = (query: string) =>
  matchStreets(INDEX, query).map((street) => street.name);

test('words ignore case, accents and ß', () => {
  assert.deepEqual(streetWords('Öttinger Straße'), ['ottinger', 'strasse']);
  assert.deepEqual(streetWords('Rheinstr.'), ['rheinstrasse']);
});

test('a prefix finds the street, the whole name first', () => {
  assert.deepEqual(names('rhein'), [
    'Rheinallee',
    'Rheinberger Straße',
    'Rheinstraße',
    'Am Rheintor',
  ]);
});

test('ß, ss and the "str." abbreviation read the same', () => {
  for (const query of [
    'Rheinstraße',
    'rheinstrasse',
    'Rheinstr.',
    'RHEINSTR',
  ]) {
    assert.deepEqual(names(query), ['Rheinstraße'], query);
  }
  assert.deepEqual(names('bahnhofstraße'), ['Bahnhofstr']);
});

test('accents are ignored', () => {
  assert.deepEqual(names('otting'), ['Öttinger']);
});

test('any word of the name matches', () => {
  assert.deepEqual(names('adenauer'), ['Konrad-Adenauer-Straße']);
  assert.deepEqual(names('wiener str'), ['Wiener Straße']);
  assert.deepEqual(names('wienerstr'), ['Wiener Straße']);
});

test('one letter, or nothing, finds nothing', () => {
  assert.deepEqual(names('r'), []);
  assert.deepEqual(names('  '), []);
});

test('the territories come with the street', () => {
  assert.deepEqual(matchStreets(INDEX, 'rheinstraße'), [
    { name: 'Rheinstraße', numbers: ['M12', 'M14'] },
  ]);
});

test('territory numbers compare without zeros and spaces', () => {
  assert.equal(territoryKey('M01'), 'M1');
  assert.equal(territoryKey('m 1'), 'M1');
  assert.deepEqual(streetsOf(INDEX, 'M1'), ['Wiener Straße']);
  assert.deepEqual(streetsOf(INDEX, 'M12'), ['Bahnhofstr', 'Rheinstraße']);
});

test('the list search needs three letters', () => {
  assert.deepEqual([...streetTerritories(INDEX, 'rh')], []);
  assert.deepEqual([...streetTerritories(INDEX, 'wiener')], ['M1']);
});
