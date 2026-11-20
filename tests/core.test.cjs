'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../diary-core.js');
function day(offset) { const d = new Date(); d.setDate(d.getDate() + offset); return C.today(d); }
function entry(offset, fields) { return C.normalize(Object.assign(C.blank(day(offset)), fields)); }
test('blank and explicit zero remain distinct, including paired statistics', function () {
  const blank = entry(0, {}), zero = entry(-1, { before: 0, after: 0, vomiting: 0, painStatus: 0 });
  assert.equal(blank.before, null);
  assert.equal(C.hasContent(blank), false);
  assert.equal(C.hasContent(zero), true);
  assert.equal(C.stats([blank]).before, null);
  assert.deepEqual([C.stats([zero]).before, C.stats([zero]).after, C.stats([zero]).vomitingDays], [0, 0, 0]);
  assert.equal(C.stats([blank, zero]).vomitingLogged, 1);
});
test('paired averages exclude scores from incomplete pairs', function () {
  const s = C.stats([entry(0, { before: 2, after: 6 }), entry(-1, { before: 10 }), entry(-2, { after: 0 }), entry(-3, { before: 0, after: 0 })]);
  assert.equal(s.paired, 2);
  assert.equal(s.before, 1);
  assert.equal(s.after, 3);
  assert.equal(s.change, 2);
  assert.equal(s.increased, 1);
});
test('validation rejects invalid dates, scores, types, options, and unknown backup versions', function () {
  assert.throws(function () { entry(0, { before: 11 }); });
  assert.throws(function () { entry(0, { before: '5' }); });
  assert.throws(function () { entry(0, { breakfast: {} }); });
  assert.throws(function () { entry(0, { stool: 'unexpected option' }); });
  assert.throws(function () { entry(0, { painLocations: ['not an area'] }); });
  assert.throws(function () { C.normalize({ date: '2026-02-30' }); });
  assert.throws(function () { C.normalize({ date: day(1) }); });
  assert.throws(function () { C.readBackup({ app: C.APP, schemaVersion: 2, entries: [] }); });
});
test('hidden conditional fields do not leak stale symptoms', function () {
  const e = entry(0, { painStatus: 0, painScore: 9, painLocations: ['Right side'], painDuration: '1–3 hours', vomiting: 0, vomitingTime: '10:00', medicationTaken: 0, medicationTime: '21:00' });
  assert.equal(e.painScore, null);
  assert.deepEqual(e.painLocations, []);
  assert.equal(e.painDuration, '');
  assert.equal(e.vomitingTime, '');
  assert.equal(e.medicationTime, '');
});
test('backups round-trip all documented fields and import merges by latest save', function () {
  const e = entry(0, { before: 0, after: 7, painStatus: 1, painScore: 4, painLocations: ['All over'], painDuration: '30–60 minutes', earlyFullness: 2, vomiting: 1, vomitingTime: '08:10', medicationTaken: 1, medicationTime: '21:03', breakfast: 'Toast, tea\nYogurt', notes: 'A note with “quotes”', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' });
  const backup = Object.assign(C.empty(), { entries: [e] });
  const restored = C.readBackup(JSON.stringify(backup));
  assert.deepEqual(restored.entries[0], e);
  const newer = Object.assign({}, e, { after: 3, updatedAt: '2026-03-01T00:00:00.000Z' });
  const older = Object.assign({}, e, { after: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(C.merge([e], [older])[0].after, 7);
  assert.equal(C.merge([e], [newer])[0].after, 3);
  assert.equal(C.merge([e], [newer, entry(-1, { before: 0 })]).length, 2);
});
test('invalid import fails as a whole and leaves existing records intact', function () {
  const data = Object.assign(C.empty(), { entries: [entry(0, { before: 4 })] });
  const before = JSON.stringify(data);
  assert.throws(function () { C.readBackup({ app: C.APP, schemaVersion: 1, entries: [entry(-1, { before: 2 }), { date: 'invalid' }] }); });
  assert.equal(JSON.stringify(data), before);
});
test('calendar ranges include today and the boundary day exactly once', function () {
  const rows = [entry(0, { before: 0 }), entry(-13, { before: 1 }), entry(-14, { before: 2 })];
  assert.deepEqual(C.inRange(rows, '14').map(function (e) { return e.before; }), [1, 0]);
  assert.equal(C.inRange(rows, 'all').length, 3);
});
test('CSV quotes text, preserves missing values, and neutralizes spreadsheet formulas', function () {
  const e = entry(0, { before: 0, breakfast: '=HYPERLINK("https://example.invalid")', notes: 'Line 1, "quoted"\nLine 2' });
  const csv = C.csv([e]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(csv.includes('"Line 1, ""quoted""\nLine 2"'));
  assert.ok(csv.includes('"Not recorded"'));
  assert.ok(csv.includes('"0"'));
});
test('visit summary reports recorded denominators and never turns unknown into zero', function () {
  const text = C.summary([entry(0, { before: 0, after: 3 }), entry(-1, { vomiting: 1 })], 'Last 14 days', 'Evening pill');
  assert.ok(text.includes('Paired breakfast scores: 1'));
  assert.ok(text.includes('1 days with vomiting, out of 1 days where vomiting was recorded'));
  assert.ok(text.includes('before Not recorded'));
  assert.ok(text.includes('before 0/10'));
});
