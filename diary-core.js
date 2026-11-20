(function (root) {
  'use strict';
  const APP = 'daylight-symptom-notebook';
  const STORE = 'daylight.notebook.v1';
  const DRAFT = 'daylight.draft.v1';
  const defaults = { medicationName: 'Tri-Lo-Marzia', medicationTime: '21:00', theme: 'light' };
  const enums = {
    portion: ['Small', 'Usual', 'Large'],
    afterMinutes: ['30', '45', '60', '90', 'Other'],
    nauseaDuration: ['Under 15 minutes', '15–30 minutes', '30–60 minutes', '1–3 hours', 'Over 3 hours', 'On and off'],
    painDuration: ['Under 15 minutes', '15–30 minutes', '30–60 minutes', '1–3 hours', 'Over 3 hours', 'On and off'],
    stool: ['No bowel movement', 'Usual / soft', 'Hard / lumpy', 'Loose / watery', 'Mixed'],
    appetite: ['Usual', 'Less than usual', 'More than usual'],
    mealsImpact: ['No meals missed', 'Ate less', 'Skipped a meal'],
    schoolImpact: ['No effect', 'Missed part of school', 'Missed a school day', 'Not a school day'],
    context: ['School day', 'Weekend / day off']
  };
  const locations = ['Upper middle', 'Around belly button', 'Lower belly', 'Right side', 'Left side', 'All over'];
  const textLimits = { breakfast: 1000, notes: 2000 };
  const scoreFields = { before: [0, 10], after: [0, 10], painStatus: [0, 1], painScore: [1, 10], earlyFullness: [0, 3], bloating: [0, 3], heartburn: [0, 3], vomiting: [0, 3], medicationTaken: [0, 1], period: [0, 1] };
  function today(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T12:00:00');
    return Number.isFinite(d.getTime()) && today(d) === s && s >= '1900-01-01' && s <= today();
  }
  function blank(date) {
    const e = { date: date || today(), painLocations: [] };
    Object.keys(scoreFields).forEach(function (k) { e[k] = null; });
    Object.keys(enums).forEach(function (k) { e[k] = ''; });
    Object.keys(textLimits).forEach(function (k) { e[k] = ''; });
    ['breakfastTime', 'vomitingTime', 'medicationTime'].forEach(function (k) { e[k] = ''; });
    return e;
  }
  function settings(input) {
    const x = input || {};
    return {
      medicationName: typeof x.medicationName === 'string' ? x.medicationName.trim().slice(0, 80) : defaults.medicationName,
      medicationTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.medicationTime || '') ? x.medicationTime : defaults.medicationTime,
      theme: ['light', 'dark', 'system'].includes(x.theme) ? x.theme : defaults.theme
    };
  }
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !validDate(input.date)) throw new Error('An entry has an invalid or future date.');
    const e = blank(input.date);
    Object.keys(scoreFields).forEach(function (k) {
      const v = input[k];
      if (v == null || v === '') return;
      const range = scoreFields[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < range[0] || v > range[1]) throw new Error('An entry has an invalid ' + k + ' value.');
      e[k] = v;
    });
    Object.keys(enums).forEach(function (k) {
      if (input[k] != null && input[k] !== '') {
        if (!enums[k].includes(input[k])) throw new Error('An entry has an invalid ' + k + ' option.');
        e[k] = input[k];
      }
    });
    Object.keys(textLimits).forEach(function (k) {
      if (input[k] != null && typeof input[k] !== 'string') throw new Error('An entry contains invalid notes.');
      e[k] = (input[k] || '').slice(0, textLimits[k]);
    });
    ['breakfastTime', 'vomitingTime', 'medicationTime'].forEach(function (k) {
      if (input[k]) {
        if (typeof input[k] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[k])) throw new Error('An entry has an invalid time.');
        e[k] = input[k];
      }
    });
    if (input.painLocations != null) {
      if (!Array.isArray(input.painLocations) || input.painLocations.some(function (s) { return !locations.includes(s); })) throw new Error('An entry has an invalid pain location.');
      e.painLocations = Array.from(new Set(input.painLocations));
    }
    if (e.painStatus !== 1) { e.painScore = null; e.painLocations = []; e.painDuration = ''; }
    if (!e.vomiting) e.vomitingTime = '';
    if (e.medicationTaken !== 1) e.medicationTime = '';
    ['createdAt', 'updatedAt'].forEach(function (k) {
      if (input[k] != null && input[k] !== '') {
        if (typeof input[k] !== 'string' || !Number.isFinite(Date.parse(input[k]))) throw new Error('An entry has an invalid save time.');
        e[k] = new Date(input[k]).toISOString();
      }
    });
    return e;
  }
  function hasContent(entry) {
    const e = normalize(entry);
    return Object.keys(scoreFields).some(function (k) { return e[k] !== null; }) ||
      Object.keys(enums).some(function (k) { return !!e[k]; }) ||
      Object.keys(textLimits).some(function (k) { return !!e[k].trim(); }) || !!e.breakfastTime;
  }
  function empty() { return { app: APP, schemaVersion: 1, entries: [], settings: settings() }; }
  function readBackup(raw) {
    const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!x || x.app !== APP || x.schemaVersion !== 1 || !Array.isArray(x.entries)) throw new Error('Choose a Daylight JSON backup (version 1).');
    if (x.entries.length > 10000) throw new Error('This backup contains too many entries.');
    const map = new Map();
    x.entries.forEach(function (entry) {
      const e = normalize(entry);
      const old = map.get(e.date);
      if (!old || (e.updatedAt || '') >= (old.updatedAt || '')) map.set(e.date, e);
    });
    return { app: APP, schemaVersion: 1, entries: Array.from(map.values()).sort(function (a, b) { return a.date.localeCompare(b.date); }), settings: settings(x.settings) };
  }
  function merge(a, b) {
    const map = new Map(a.map(function (e) { return [e.date, e]; }));
    b.forEach(function (e) {
      const old = map.get(e.date);
      if (!old || (e.updatedAt || '') > (old.updatedAt || '')) map.set(e.date, e);
    });
    return Array.from(map.values()).sort(function (x, y) { return x.date.localeCompare(y.date); });
  }
  function inRange(entries, days, end) {
    if (days === 'all') return entries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    const last = end || today();
    const start = new Date(last + 'T12:00:00');
    start.setDate(start.getDate() - Number(days) + 1);
    const first = today(start);
    return entries.filter(function (e) { return e.date >= first && e.date <= last; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function stats(entries) {
    const paired = entries.filter(function (e) { return e.before !== null && e.after !== null; });
    function mean(field) { return paired.length ? paired.reduce(function (sum, e) { return sum + e[field]; }, 0) / paired.length : null; }
    const before = mean('before'), after = mean('after');
    const v = entries.filter(function (e) { return e.vomiting !== null; });
    return {
      days: entries.length, paired: paired.length, before: before, after: after,
      change: paired.length ? after - before : null,
      increased: paired.filter(function (e) { return e.after > e.before; }).length,
      vomitingLogged: v.length, vomitingDays: v.filter(function (e) { return e.vomiting > 0; }).length,
      vomitingCount: v.reduce(function (n, e) { return n + e.vomiting; }, 0),
      vomitingAtLeast: v.some(function (e) { return e.vomiting === 3; }),
      painLogged: entries.filter(function (e) { return e.painStatus !== null; }).length,
      painDays: entries.filter(function (e) { return e.painStatus === 1; }).length
    };
  }
  const severity = ['None', 'Mild', 'Moderate', 'Strong'];
  function value(v, suffix) { return v === null || v === '' || v === undefined ? 'Not recorded' : String(v) + (suffix || ''); }
  function label(k, v) {
    if (v === null || v === '' || v === undefined) return 'Not recorded';
    if (['earlyFullness', 'bloating', 'heartburn'].includes(k)) return severity[v];
    if (['painStatus', 'medicationTaken', 'period'].includes(k)) return v === 1 ? 'Yes' : 'No';
    if (k === 'vomiting') return v === 3 ? '3+' : String(v);
    return value(v);
  }
  const csvFields = [
    ['Date', 'date'], ['Nausea before breakfast (0–10)', 'before'], ['Nausea after breakfast (0–10)', 'after'],
    ['Minutes after breakfast', 'afterMinutes'], ['Nausea duration', 'nauseaDuration'], ['Breakfast time', 'breakfastTime'],
    ['Breakfast foods', 'breakfast'], ['Portion', 'portion'], ['Day type', 'context'], ['Abdominal pain', 'painStatus'],
    ['Pain severity (1–10)', 'painScore'], ['Pain location', 'painLocations'], ['Pain duration', 'painDuration'],
    ['Early fullness', 'earlyFullness'], ['Bloating', 'bloating'], ['Heartburn / sour taste', 'heartburn'],
    ['Vomiting count', 'vomiting'], ['Vomiting time', 'vomitingTime'], ['Bowel movement', 'stool'],
    ['Appetite', 'appetite'], ['Meal impact', 'mealsImpact'], ['School impact', 'schoolImpact'], ['Medication taken', 'medicationTaken'],
    ['Medication time', 'medicationTime'], ['Period today', 'period'], ['Notes', 'notes'], ['Last saved', 'updatedAt']
  ];
  function csv(entries) {
    function cell(v) {
      let text = String(v);
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }
    const rows = [csvFields.map(function (f) { return f[0]; })];
    entries.forEach(function (e) { rows.push(csvFields.map(function (f) { return f[1] === 'painLocations' ? (e.painLocations.join('; ') || 'Not recorded') : label(f[1], e[f[1]]); })); });
    return '\uFEFF' + rows.map(function (row) { return row.map(cell).join(','); }).join('\r\n');
  }
  function summary(entries, rangeLabel, medication) {
    const s = stats(entries);
    const lines = ['DAYLIGHT · SYMPTOM NOTEBOOK', rangeLabel, 'Saved days: ' + s.days, 'Paired breakfast scores: ' + s.paired];
    if (s.paired) lines.push('Average nausea before breakfast: ' + s.before.toFixed(1) + '/10', 'Average nausea after breakfast: ' + s.after.toFixed(1) + '/10', 'Higher nausea after breakfast: ' + s.increased + ' of ' + s.paired + ' paired days');
    lines.push('Vomiting: ' + s.vomitingDays + ' days with vomiting, out of ' + s.vomitingLogged + ' days where vomiting was recorded.', 'Abdominal pain: ' + s.painDays + ' days with pain, out of ' + s.painLogged + ' days where pain was recorded.');
    if (medication) lines.push('Medication label used in diary: ' + medication);
    lines.push('Missing entries and unrecorded symptoms are unknown, not zero. These observations do not establish a cause.', '', 'DAILY NOTES');
    entries.forEach(function (e) {
      lines.push('', e.date, 'Nausea: before ' + value(e.before, '/10') + '; after ' + value(e.after, '/10') + '; checked after ' + value(e.afterMinutes, ' minutes') + '; duration ' + value(e.nauseaDuration), 'Breakfast: ' + value(e.breakfast) + '; time ' + value(e.breakfastTime) + '; portion ' + value(e.portion), 'Pain: ' + label('painStatus', e.painStatus) + '; severity ' + value(e.painScore, '/10') + '; location ' + (e.painLocations.join(', ') || 'Not recorded') + '; duration ' + value(e.painDuration), 'Early fullness: ' + label('earlyFullness', e.earlyFullness) + '; bloating: ' + label('bloating', e.bloating) + '; heartburn: ' + label('heartburn', e.heartburn), 'Vomiting count: ' + label('vomiting', e.vomiting) + '; time ' + value(e.vomitingTime), 'Bowel movement: ' + value(e.stool) + '; appetite: ' + value(e.appetite), 'Meals: ' + value(e.mealsImpact) + '; school: ' + value(e.schoolImpact) + '; day type: ' + value(e.context), 'Medication taken: ' + label('medicationTaken', e.medicationTaken) + '; time ' + value(e.medicationTime) + '; period: ' + label('period', e.period), 'Notes: ' + value(e.notes));
    });
    return lines.join('\n');
  }
  const api = { APP: APP, STORE: STORE, DRAFT: DRAFT, defaults: defaults, enums: enums, locations: locations, scoreFields: scoreFields, today: today, validDate: validDate, blank: blank, settings: settings, normalize: normalize, hasContent: hasContent, empty: empty, readBackup: readBackup, merge: merge, inRange: inRange, stats: stats, csv: csv, summary: summary, label: label, value: value };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaylightCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
