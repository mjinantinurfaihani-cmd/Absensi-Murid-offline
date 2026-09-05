import assert from 'node:assert/strict';
import { isWithinTargetRadius, haversineDistanceMeters } from './location.ts';

const targetLat = -6.945515441333451;
const targetLon = 107.71434809536049;

assert.equal(haversineDistanceMeters(targetLat, targetLon, targetLat, targetLon), 0);
assert.equal(isWithinTargetRadius(targetLat, targetLon), true);
assert.equal(isWithinTargetRadius(targetLat + 0.0002, targetLon), false);

console.log('location checks ok');
