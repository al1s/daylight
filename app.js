(function () {
  'use strict';
  const C = window.DaylightCore;
  const main = document.getElementById('main');
  const dialog = document.getElementById('dialog');
  let toastTimer, draftTimer, lastFocus;
  const state = { data: C.empty(), drafts: {}, view: 'today', date: C.today(), historyRange: '14', patternRange: '14', search: '', baseVersion: '', storageBlocked: false, rawStored: '', offline: false, pendingImport: null };
  const icon = function (name, extra) { return '<svg class="icon ' + (extra || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (s) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]; }); }
  function dateObject(date) { return new Date(date + 'T12:00:00'); }
  function pretty(date, options) { return dateObject(date).toLocaleDateString(undefined, options || { weekday: 'long', month: 'short', day: 'numeric' }); }
  function number(value) { return value === null ? '—' : value.toFixed(1); }
  function rangeLabel(days) { return days === 'all' ? 'All saved notes · exported ' + C.today() : 'Last ' + days + ' days · ending ' + C.today(); }
  function showStorageError(message) {
    state.storageBlocked = true;
    const b = document.getElementById('storage-banner');
    b.hidden = false;
    b.innerHTML = esc(message) + (state.rawStored ? ' <button data-action="recover-storage">Download existing data</button>' : '') + ' <button data-action="retry-storage">Try again</button>';
  }
  function readLatest() {
    const raw = localStorage.getItem(C.STORE);
    return raw ? C.readBackup(raw) : C.empty();
  }
  function commit(change) {
    try {
      if (state.storageBlocked) throw new Error('Local saving is unavailable. Use “Try again” in the banner first.');
      const next = change(readLatest());
      localStorage.setItem(C.STORE, JSON.stringify(next));
      state.data = next;
      return true;
    } catch (err) {
      showStorageError('Your note was not saved. ' + (state.rawStored ? 'Existing data is untouched.' : 'Storage may be blocked or full. Your current form is still here.'));
      toast(err.message || 'Local saving failed.');
      return false;
    }
  }
  function load() {
    try {
      state.rawStored = localStorage.getItem(C.STORE) || '';
      state.data = state.rawStored ? C.readBackup(state.rawStored) : C.empty();
      const testKey = 'daylight.storage-check';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      state.rawStored = '';
    } catch (err) {
      showStorageError(state.rawStored ? 'This notebook could not be read. Existing data has been left untouched.' : 'This browser cannot save locally right now. Allow website storage to keep your notes.');
    }
    try {
      const drafts = JSON.parse(localStorage.getItem(C.DRAFT) || '{}');
      if (drafts && typeof drafts === 'object' && !Array.isArray(drafts)) {
        Object.keys(drafts).slice(0, 1000).forEach(function (date) {
          const d = drafts[date];
          if (!C.validDate(date) || !d || !d.entry || !Number.isFinite(Date.parse(d.savedAt || ''))) return;
          try { state.drafts[date] = { entry: C.normalize(d.entry), savedAt: d.savedAt }; } catch (_) { /* Leave invalid drafts out of the editable state. */ }
        });
      }
    } catch (_) { /* A malformed draft never replaces saved notes. */ }
  }
  function applyTheme() {
    const theme = state.data.settings.theme;
    document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  }
  function toast(message, duration) {
    const el = document.getElementById('toast');
    clearTimeout(toastTimer);
    el.textContent = message;
    el.hidden = false;
    toastTimer = setTimeout(function () { el.hidden = true; }, duration || 3400);
  }
  function modal(title, body, buttons) {
    lastFocus = document.activeElement;
    dialog.innerHTML = '<div class="dialog-top"><h2 id="dialog-title">' + esc(title) + '</h2><button class="close-dialog" data-action="close-dialog" aria-label="Close">' + icon('close') + '</button></div><div class="dialog-body">' + body + '</div><div class="dialog-actions">' + (buttons || '<button class="button primary" data-action="close-dialog">Got it</button>') + '</div>';
    dialog.showModal();
    const focus = dialog.querySelector('[autofocus]') || dialog.querySelector('button');
    if (focus) focus.focus();
  }
  function closeModal() { dialog.close(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  function choices(name, title, options, selected, grid) {
    return '<fieldset class="choice-field"><legend>' + esc(title) + '</legend><div class="chips ' + (grid ? 'chip-grid' : '') + '">' + options.map(function (o) {
      const v = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(v) + '"' + (selected !== null && selected !== '' && String(selected) === String(v) ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
    }).join('') + '</div><button class="choice-clear" type="button" data-action="clear-choice" data-name="' + name + '">Clear answer</button></fieldset>';
  }
  function select(name, title, values, current) {
    return '<div class="field"><label class="label" for="f-' + name + '">' + esc(title) + '</label><select id="f-' + name + '" name="' + name + '"><option value="">Not recorded</option>' + values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></div>';
  }
  function timeField(name, label, value) { return '<div class="field"><label class="label" for="f-' + name + '">' + esc(label) + '</label><input type="time" id="f-' + name + '" name="' + name + '" value="' + esc(value) + '"></div>'; }
  function score(name, label, sub, value, min) {
    const lower = min || 0;
    return '<div class="score-block"><div class="score-head"><label for="range-' + name + '">' + esc(label) + '<span class="score-sub">' + esc(sub) + '</span></label><output id="out-' + name + '" class="score-output ' + (value === null ? 'unset' : '') + '" for="range-' + name + '">' + (value === null ? 'Not logged' : value + '<small> / 10</small>') + '</output></div><input type="hidden" name="' + name + '" value="' + (value === null ? '' : value) + '"><div class="range-wrap"><input type="range" id="range-' + name + '" name="slider-' + name + '" data-score="' + name + '" min="' + lower + '" max="10" step="1" value="' + (value === null ? lower : value) + '" style="--fill:' + (value === null ? 0 : (value - lower) / (10 - lower) * 100) + '%" aria-valuetext="' + (value === null ? 'Not recorded; move to enter a score' : value + ' out of 10') + '"></div><div class="range-labels"><span>' + (lower ? '1 · Mild' : '0 · None') + '</span><span>5 · Moderate</span><span>10 · Worst</span></div><div class="score-tools">' + (!lower ? '<button type="button" data-action="zero-score" data-name="' + name + '">No nausea (0)</button>' : '') + '<button type="button" data-action="clear-score" data-name="' + name + '">Clear score</button></div></div>';
  }
  function section(title, subtitle, name, body, open) {
    return '<details class="card"' + (open ? ' open' : '') + '><summary><span class="section-icon ' + (name === 'leaf' ? 'mint' : name === 'clock' ? 'peach' : '') + '">' + icon(name) + '</span><span class="summary-copy"><strong>' + esc(title) + '</strong><small>' + esc(subtitle) + '</small></span>' + icon('chevron', 'summary-chevron') + '</summary><div class="detail-body">' + body + '</div></details>';
  }
  function flower() {
    return '<div class="hero-art" aria-hidden="true"><div class="blob"></div><div class="orbit"></div><svg class="flower" viewBox="0 0 120 120"><g fill="#bca9ed"><ellipse cx="60" cy="30" rx="16" ry="27"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(45 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(90 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(135 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(180 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(225 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(270 60 60)"/><ellipse cx="60" cy="30" rx="16" ry="27" transform="rotate(315 60 60)"/></g><circle cx="60" cy="60" r="23" fill="#ffdf99"/><circle cx="53" cy="58" r="2" fill="#584638"/><circle cx="67" cy="58" r="2" fill="#584638"/><path d="M53 67q7 6 14 0" fill="none" stroke="#584638" stroke-width="2" stroke-linecap="round"/></svg><span class="sparkle">✦</span><span class="sparkle second">✧</span><span class="art-sticker">one day at a time</span></div>';
  }
  function selectedEntry() {
    const saved = state.data.entries.find(function (e) { return e.date === state.date; });
    const draft = state.drafts[state.date];
    state.baseVersion = saved && saved.updatedAt || '';
    if (draft && (!saved || draft.savedAt > (saved.updatedAt || ''))) return { entry: draft.entry, draft: true, saved: saved };
    return { entry: saved || C.blank(state.date), draft: false, saved: saved };
  }
  function renderToday() {
    const selected = selectedEntry(), e = selected.entry;
    const isToday = state.date === C.today();
    const logged = C.inRange(state.data.entries, '14').length;
    const painDetails = score('painScore', 'Pain level', 'How strong was it?', e.painScore, 1) + '<fieldset class="choice-field"><legend>Where did it hurt?</legend><div class="chips">' + C.locations.map(function (p) { return '<label class="chip"><input type="checkbox" name="painLocations" value="' + esc(p) + '"' + (e.painLocations.includes(p) ? ' checked' : '') + '><span>' + esc(p) + '</span></label>'; }).join('') + '</div></fieldset>' + select('painDuration', 'How long did the pain last?', C.enums.painDuration, e.painDuration);
    const pain = choices('painStatus', 'Any stomach pain today?', [[0, 'No pain'], [1, 'Yes, some pain']], e.painStatus) + '<div id="pain-details" class="field"' + (e.painStatus !== 1 ? ' hidden' : '') + '>' + painDetails + '</div>';
    const digestion = choices('earlyFullness', 'Full after just a few bites?', [[0, 'No'], [1, 'A little'], [2, 'Moderate'], [3, 'Strong']], e.earlyFullness, true) + choices('bloating', 'Bloating', [[0, 'None'], [1, 'Mild'], [2, 'Moderate'], [3, 'Strong']], e.bloating, true) + choices('heartburn', 'Heartburn or a sour taste', [[0, 'None'], [1, 'Mild'], [2, 'Moderate'], [3, 'Strong']], e.heartburn, true) + choices('vomiting', 'How many times did you throw up?', [[0, 'None'], [1, 'Once'], [2, 'Twice'], [3, '3+ times']], e.vomiting, true) + '<div id="vomiting-time"' + (!(e.vomiting > 0) ? ' hidden' : '') + '>' + timeField('vomitingTime', 'Time of vomiting (optional)', e.vomitingTime) + '</div>' + select('stool', 'Bowel movement today', C.enums.stool, e.stool);
    const life = select('appetite', 'Appetite', C.enums.appetite, e.appetite) + select('mealsImpact', 'Did symptoms affect meals?', C.enums.mealsImpact, e.mealsImpact) + select('schoolImpact', 'Did symptoms affect school?', C.enums.schoolImpact, e.schoolImpact) + choices('context', 'What kind of day was it?', C.enums.context, e.context);
    const medication = '<p class="info-line">' + esc(state.data.settings.medicationName || 'Your medication') + ' · usual time ' + esc(state.data.settings.medicationTime) + '<br>A record of what happened, not a medication reminder.</p>' + choices('medicationTaken', 'Was the evening pill taken?', [[1, 'Taken'], [0, 'Missed']], e.medicationTaken) + '<div id="medication-time"' + (e.medicationTaken !== 1 ? ' hidden' : '') + '>' + timeField('medicationTime', 'Actual time (optional)', e.medicationTime) + '</div>' + choices('period', 'Period today? (optional)', [[1, 'Yes'], [0, 'No']], e.period);
    const saveStatus = selected.draft ? 'Draft restored on this device' : selected.saved ? 'Saved · edit anytime' : 'Any detail is a good start';
    main.innerHTML = '<section class="hero"><div class="hero-copy"><p class="eyebrow">' + esc(pretty(C.today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</p><h1>Small notes.<br>Clearer days.</h1><p>A minute to notice how you feel.<br>No perfect entries needed.</p></div>' + flower() + '</section><div class="page-grid"><div class="editor"><div class="date-bar"><span class="date-title">' + (isToday ? 'Today’s page' : 'Your page') + '</span><div class="date-controls">' + (!isToday ? '<button class="link-button" data-action="today-date">Today</button>' : '') + '<label class="sr-only" for="entry-date">Date of diary entry</label><input id="entry-date" type="date" value="' + state.date + '" max="' + C.today() + '"></div></div><form id="diary-form" novalidate><div class="card"><div class="section-heading"><span class="section-icon">' + icon('sun') + '</span><div><h2>The morning check-in</h2><p>Two little scores. A little more insight.</p></div></div>' + score('before', 'Before breakfast', 'How nauseated did you feel?', e.before) + score('after', 'After breakfast', 'Check about 30–60 minutes after eating.', e.after) + '<div class="score-after-meta">' + select('afterMinutes', 'How long after breakfast did you check?', C.enums.afterMinutes, e.afterMinutes) + '</div><details class="details-minor"' + (e.nauseaDuration ? ' open' : '') + '><summary>' + icon('clock') + 'Add how long nausea lasted</summary><div class="details-content">' + select('nauseaDuration', 'Nausea duration', C.enums.nauseaDuration, e.nauseaDuration) + '</div></details></div><div class="card"><div class="section-heading"><span class="section-icon peach">' + icon('leaf') + '</span><div><h2>What was for breakfast?</h2><p>A few words are plenty.</p></div></div><label class="sr-only" for="f-breakfast">Breakfast foods and drinks</label><textarea id="f-breakfast" name="breakfast" rows="2" maxlength="1000" placeholder="Toast, yogurt, tea… whatever was on the menu.">' + esc(e.breakfast) + '</textarea><div class="two-fields field">' + timeField('breakfastTime', 'Breakfast time', e.breakfastTime) + select('portion', 'Portion size', C.enums.portion, e.portion) + '</div></div>' + section('Any stomach pain?', 'Location, strength, and how long it lasted', 'sun', pain, e.painStatus === 1) + section('A few extra details', 'Fullness, bloating, heartburn, vomiting & bowels', 'leaf', digestion, false) + section('The rest of your day', 'Appetite, meals, and school', 'book', life, false) + section('Evening & cycle notes', 'Medication and an optional period check', 'clock', medication, false) + '<div class="card"><label class="label" for="f-notes">Anything else on your mind?</label><p class="hint" style="margin:0 0 12px">Sleep, stress, something that helped, or just how the day felt.</p><textarea id="f-notes" name="notes" rows="3" maxlength="2000" placeholder="A little note to your future self…">' + esc(e.notes) + '</textarea><div class="reset-note"><span class="tiny muted">Every question is optional.</span><button class="link-button" type="button" data-action="clear-draft">Reset this form</button></div></div><div class="savebar"><p class="save-text"><strong id="save-status">' + saveStatus + '</strong><span id="save-detail">Blank answers stay unknown.</span></p><button class="button primary" type="submit">' + icon('check') + '<span>' + (selected.saved ? 'Update note' : 'Save note') + '</span></button></div><p id="form-error" class="form-error" role="alert" hidden></p></form></div><aside class="guide"><div class="card aside-card"><p class="eyebrow" style="margin-bottom:8px">One note at a time</p><h2>Your 14-day notebook</h2><div class="progress-top"><strong>' + logged + '<span> / 14 days</span></strong><span>noticed & noted</span></div><div class="progress-dots" aria-label="' + logged + ' of the last 14 days have a saved note">' + Array.from({ length: 14 }, function (_, i) { return '<span class="progress-dot ' + (i < logged ? 'filled' : '') + '">' + (i < logged ? icon('check') : '') + '</span>'; }).join('') + '</div><p class="hint">Good days count, too. Gaps are okay.<br>You can always add an earlier day.</p></div><div class="card quote-card">' + icon('leaf') + '<blockquote>You don’t need all the answers.<br>Just a little space to notice.</blockquote><p>This page is yours.</p></div><div class="aside-install">' + icon('plus') + '<button data-action="install"><strong>Keep Daylight close</strong>Add it to your iPhone Home Screen.</button></div></aside></div><p class="page-footer">A little more context. A little less guesswork.</p>';
    const form = document.getElementById('diary-form');
    form.addEventListener('submit', function (event) { event.preventDefault(); saveEntry(); });
  }
  function collectForm() {
    const form = document.getElementById('diary-form');
    if (!form) return null;
    const e = C.blank(state.date);
    Object.keys(C.scoreFields).forEach(function (k) {
      const field = form.elements.namedItem(k), v = field ? field.value : '';
      e[k] = v === '' ? null : Number(v);
    });
    Object.keys(C.enums).concat(['breakfast', 'notes', 'breakfastTime', 'vomitingTime', 'medicationTime']).forEach(function (k) {
      const field = form.elements.namedItem(k);
      e[k] = field ? field.value : '';
    });
    e.painLocations = Array.from(form.querySelectorAll('input[name="painLocations"]:checked')).map(function (el) { return el.value; });
    return C.normalize(e);
  }
  function persistDraft() {
    clearTimeout(draftTimer);
    const form = document.getElementById('diary-form');
    if (!form || form.dataset.dirty !== 'true') return;
    try {
      const entry = collectForm();
      state.drafts[state.date] = { entry: entry, savedAt: new Date().toISOString() };
      if (!state.storageBlocked) {
        localStorage.setItem(C.DRAFT, JSON.stringify(state.drafts));
        const detail = document.getElementById('save-detail');
        if (detail) detail.textContent = 'Draft kept on this device.';
      }
    } catch (_) { showStorageError('Your draft could not be stored. Keep this page open and export or save when storage is available.'); }
  }
  function changed() {
    const form = document.getElementById('diary-form');
    if (!form) return;
    form.dataset.dirty = 'true';
    const status = document.getElementById('save-status');
    if (status) status.textContent = 'A little update to save';
    const err = document.getElementById('form-error');
    if (err) err.hidden = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDraft, 350);
  }
  function setScore(name, value) {
    const form = document.getElementById('diary-form');
    const hidden = form.elements.namedItem(name), slider = document.getElementById('range-' + name), output = document.getElementById('out-' + name);
    hidden.value = value === null ? '' : value;
    slider.value = value === null ? slider.min : value;
    slider.style.setProperty('--fill', value === null ? '0%' : (value - Number(slider.min)) / (10 - Number(slider.min)) * 100 + '%');
    slider.setAttribute('aria-valuetext', value === null ? 'Not recorded; move to enter a score' : value + ' out of 10');
    output.classList.toggle('unset', value === null);
    output.innerHTML = value === null ? 'Not logged' : value + '<small> / 10</small>';
  }
  function syncConditional() {
    const form = document.getElementById('diary-form');
    if (!form) return;
    document.getElementById('pain-details').hidden = form.elements.namedItem('painStatus').value !== '1';
    document.getElementById('vomiting-time').hidden = !['1', '2', '3'].includes(form.elements.namedItem('vomiting').value);
    document.getElementById('medication-time').hidden = form.elements.namedItem('medicationTaken').value !== '1';
  }
  function saveEntry(overwrite) {
    const e = collectForm();
    if (!e) return;
    if (!C.hasContent(e)) {
      const error = document.getElementById('form-error');
      error.hidden = false;
      error.textContent = 'Add one score or detail first. “No nausea (0)” counts, too.';
      error.scrollIntoView({ block: 'nearest' });
      return;
    }
    let existing;
    try { existing = readLatest().entries.find(function (x) { return x.date === state.date; }); } catch (_) { showStorageError('Saved data could not be read. Your current form has been kept.'); return; }
    if (!overwrite && (existing && existing.updatedAt || '') !== state.baseVersion) {
      persistDraft();
      modal('This day changed elsewhere', '<p>A saved note for this date changed in another tab. Replace it with the details currently in your form?</p>', '<button class="button outline" data-action="close-dialog">Keep editing</button><button class="button primary" data-action="overwrite-entry">Save this version</button>');
      return;
    }
    const now = new Date().toISOString();
    e.createdAt = existing && existing.createdAt || now;
    e.updatedAt = now;
    if (!commit(function (latest) { latest.entries = latest.entries.filter(function (x) { return x.date !== e.date; }).concat([e]).sort(function (a, b) { return a.date.localeCompare(b.date); }); return latest; })) return;
    clearTimeout(draftTimer);
    delete state.drafts[state.date];
    try { localStorage.setItem(C.DRAFT, JSON.stringify(state.drafts)); } catch (_) { /* The saved record is newer than any surviving draft. */ }
    if (dialog.open) closeModal();
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    toast('Noted. A little more of the picture.');
  }
  function heading(eyebrow, title, subtitle, action) {
    return '<div class="view-heading"><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>' + (action || '') + '</div>';
  }
  function rangeButtons(name, selected) {
    return '<div class="segmented" role="group" aria-label="Date range">' + [['14', '14 days'], ['30', '30 days'], ['all', 'All time']].map(function (v) { return '<button data-action="range" data-range-type="' + name + '" data-value="' + v[0] + '" aria-pressed="' + (selected === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div>';
  }
  function emptyState(title, body, withButton) {
    return '<div class="card empty-state"><span class="empty-art">' + icon('book') + '</span><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p>' + (withButton ? '<button class="button primary" data-nav="today">' + icon('plus') + 'Write a little note</button>' : '') + '</div>';
  }
  function entryFacts(e) {
    const facts = [
      ['Before breakfast', C.value(e.before, '/10')], ['After breakfast', C.value(e.after, '/10')],
      ['Checked after breakfast', C.value(e.afterMinutes, ' minutes')], ['Nausea duration', C.value(e.nauseaDuration)],
      ['Breakfast', C.value(e.breakfast), true], ['Breakfast time / portion', C.value(e.breakfastTime) + ' / ' + C.value(e.portion)],
      ['Pain', C.label('painStatus', e.painStatus) + (e.painStatus === 1 ? ' · ' + C.value(e.painScore, '/10') : '')],
      ['Pain location', e.painLocations.join(', ') || 'Not recorded'], ['Pain duration', C.value(e.painDuration)],
      ['Early fullness', C.label('earlyFullness', e.earlyFullness)], ['Bloating', C.label('bloating', e.bloating)],
      ['Heartburn / sour taste', C.label('heartburn', e.heartburn)], ['Vomiting', C.label('vomiting', e.vomiting) + (e.vomitingTime ? ' · ' + e.vomitingTime : '')],
      ['Bowel movement', C.value(e.stool)], ['Appetite', C.value(e.appetite)], ['Meal impact', C.value(e.mealsImpact)],
      ['School impact', C.value(e.schoolImpact)], ['Day type', C.value(e.context)],
      ['Evening medication taken', C.label('medicationTaken', e.medicationTaken) + (e.medicationTime ? ' · ' + e.medicationTime : '')],
      ['Period today', C.label('period', e.period)], ['Personal note', C.value(e.notes), true]
    ];
    return '<dl class="fact-grid">' + facts.map(function (f) { return '<div' + (f[2] ? ' class="wide"' : '') + '><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  function renderHistoryList() {
    let entries = C.inRange(state.data.entries, state.historyRange).reverse();
    const rangeCount = entries.length;
    if (state.search.trim()) {
      const q = state.search.toLocaleLowerCase();
      entries = entries.filter(function (e) { return [e.date, pretty(e.date), e.breakfast, e.notes, e.stool, e.painLocations.join(' ')].join(' ').toLocaleLowerCase().includes(q); });
    }
    const container = document.getElementById('history-list');
    if (!entries.length) {
      container.innerHTML = emptyState(state.search ? 'No matching pages' : 'Your story starts here.', state.search ? 'Try another word, or clear your search to see every note in this range.' : 'Breakfasts, feelings, ordinary days. They all have a place in your notebook.', !state.search);
      return;
    }
    container.innerHTML = '<p class="count-note">' + entries.length + (entries.length === 1 ? ' saved page' : ' saved pages') + (state.search ? ' of ' + rangeCount + ' in this range' : '') + '</p>' + entries.map(function (e) {
      const d = dateObject(e.date);
      return '<article class="card entry-card"><div class="entry-date"><span>' + esc(d.toLocaleDateString(undefined, { month: 'short' })) + '</span><strong>' + d.getDate() + '</strong><span>' + d.getFullYear() + '</span></div><div class="entry-content"><h2>' + esc(pretty(e.date, { weekday: 'long', month: 'short', day: 'numeric' })) + '</h2><div class="pills"><span class="pill purple">Before ' + (e.before === null ? '—' : e.before + '/10') + '</span><span class="pill purple">After ' + (e.after === null ? '—' : e.after + '/10') + '</span>' + (e.painStatus !== null ? '<span class="pill">' + (e.painStatus ? 'Pain' + (e.painScore !== null ? ' ' + e.painScore + '/10' : '') : 'No pain') + '</span>' : '') + (e.vomiting > 0 ? '<span class="pill peach">Vomiting ' + C.label('vomiting', e.vomiting) + '×</span>' : '') + '</div>' + (e.breakfast || e.notes ? '<p class="entry-note">' + esc((e.breakfast || e.notes).slice(0, 160)) + ((e.breakfast || e.notes).length > 160 ? '…' : '') + '</p>' : '') + '<details class="entry-expanded"><summary>Read the whole page</summary>' + entryFacts(e) + '</details><div class="entry-actions"><button data-action="edit-entry" data-date="' + e.date + '">' + icon('edit') + 'Edit page</button><button class="delete-entry" data-action="delete-entry" data-date="' + e.date + '" aria-label="Delete note for ' + esc(pretty(e.date)) + '">' + icon('trash') + 'Delete</button></div></div></article>';
    }).join('');
  }
  function renderHistory() {
    main.innerHTML = heading('Your notebook', 'Your days, in notes.', 'Every little detail, all in one place.', '<button class="button secondary" data-action="export-csv">' + icon('down') + 'Export CSV</button>') + '<div class="filter-bar">' + rangeButtons('history', state.historyRange) + '<label class="sr-only" for="history-search">Search saved pages</label><input class="search" id="history-search" type="search" placeholder="Find a food or a note…" value="' + esc(state.search) + '"></div><div id="history-list"></div><p class="page-footer">A dash means not recorded. Zero means no symptoms.</p>';
    renderHistoryList();
  }
  function chart(entries) {
    const scored = entries.filter(function (e) { return e.before !== null || e.after !== null; });
    if (!scored.length) return '<div class="chart-empty"><p>Your morning scores will appear here.<br>One check-in is enough to begin.</p></div>';
    let first, last = C.today();
    if (state.patternRange === 'all') { first = scored[0].date; last = scored[scored.length - 1].date; }
    else { const d = dateObject(last); d.setDate(d.getDate() - Number(state.patternRange) + 1); first = C.today(d); }
    const span = Math.max(1, Math.round((dateObject(last) - dateObject(first)) / 86400000));
    const width = 660, height = 250, left = 32, right = 14, top = 14, bottom = 36;
    const plotW = width - left - right, plotH = height - top - bottom;
    function x(date) { return left + Math.round((dateObject(date) - dateObject(first)) / 86400000) / span * plotW; }
    function y(score) { return top + (10 - score) / 10 * plotH; }
    let svg = '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Nausea scores before breakfast in purple and after breakfast in peach. Missing scores have gaps. Exact scores are in the notebook.">';
    [0, 5, 10].forEach(function (n) { svg += '<line class="grid" x1="' + left + '" x2="' + (width - right) + '" y1="' + y(n) + '" y2="' + y(n) + '"/><text x="14" y="' + (y(n) + 4) + '" text-anchor="middle">' + n + '</text>'; });
    [first, last].forEach(function (date, i) { svg += '<text x="' + (i ? width - right : left) + '" y="' + (height - 7) + '" text-anchor="' + (i ? 'end' : 'start') + '">' + esc(pretty(date, { month: 'short', day: 'numeric' })) + '</text>'; });
    ['before', 'after'].forEach(function (field) {
      let segment = [], prev = '';
      function flush() { if (segment.length > 1) svg += '<polyline class="plot-line ' + field + '-line" points="' + segment.join(' ') + '"/>'; segment = []; }
      entries.forEach(function (e) {
        if (e[field] === null) { flush(); prev = ''; return; }
        if (prev && Math.round((dateObject(e.date) - dateObject(prev)) / 86400000) > 1) flush();
        segment.push(x(e.date).toFixed(1) + ',' + y(e[field]).toFixed(1));
        prev = e.date;
      });
      flush();
      entries.forEach(function (e) { if (e[field] !== null) svg += '<circle class="point" cx="' + x(e.date).toFixed(1) + '" cy="' + y(e[field]).toFixed(1) + '" r="4.5" fill="' + (field === 'before' ? 'var(--purple)' : '#dc936d') + '"><title>' + esc(e.date + ' · ' + field + ' breakfast: ' + e[field] + '/10') + '</title></circle>'; });
    });
    return svg + '</svg>';
  }
  function renderPatterns() {
    const entries = C.inRange(state.data.entries, state.patternRange), s = C.stats(entries);
    const obs = s.paired ? '<strong>' + s.increased + ' of ' + s.paired + ' paired check-ins</strong> had higher nausea after breakfast. Both averages use only days with a before and after score.' : 'Add a before and after breakfast score on the same day to compare them here. Unrecorded scores are left out.';
    const effects = entries.filter(function (e) { return e.mealsImpact; });
    const school = entries.filter(function (e) { return e.schoolImpact && e.schoolImpact !== 'Not a school day'; });
    main.innerHTML = heading('A little perspective', 'Notice your patterns.', 'Your observations, with room for the bigger picture.', '<button class="button secondary" data-action="share-summary"' + (!entries.length ? ' disabled' : '') + '>' + icon('share') + 'Share visit summary</button>') + '<div class="filter-bar">' + rangeButtons('patterns', state.patternRange) + '<span class="tiny muted">Saved notes only</span></div><div class="pattern-stats"><div class="card stat-card"><span class="stat-label">Days noted</span><strong class="stat-value">' + s.days + '</strong><span class="stat-meta">in this date range</span></div><div class="card stat-card"><span class="stat-label">Average nausea</span><strong class="stat-value pair-value"><span>' + number(s.before) + ' <small>before</small></span><span>' + number(s.after) + ' <small>after</small></span></strong><span class="stat-meta">' + s.paired + ' paired check-ins · out of 10</span></div><div class="card stat-card"><span class="stat-label">Days with vomiting</span><strong class="stat-value">' + (s.vomitingLogged ? s.vomitingDays : '—') + '</strong><span class="stat-meta">of ' + s.vomitingLogged + ' days with this recorded</span></div></div><div class="card"><div class="chart-top"><div><h2>Your morning, over time</h2><p class="hint" style="margin-top:3px">Nausea · 0 is none, 10 is worst</p></div><div class="legend"><span><i></i>Before breakfast</span><span class="after"><i></i>After breakfast</span></div></div>' + chart(entries) + '<p class="hint">Gaps mean no score was recorded. Lines connect consecutive recorded days.</p></div><div class="card observation"><span class="section-icon">' + icon('leaf') + '</span><p>' + obs + '<br>These notes show what happened together, not what caused it.</p></div>' + (effects.length || school.length || s.painLogged ? '<div class="card"><h2>The rest of the picture</h2><dl class="fact-grid"><div><dt>Days with stomach pain</dt><dd>' + (s.painLogged ? s.painDays + ' of ' + s.painLogged + ' recorded days' : 'Not recorded') + '</dd></div><div><dt>Meals reduced or skipped</dt><dd>' + (effects.length ? effects.filter(function (e) { return e.mealsImpact !== 'No meals missed'; }).length + ' of ' + effects.length + ' recorded days' : 'Not recorded') + '</dd></div><div><dt>School affected</dt><dd>' + (school.length ? school.filter(function (e) { return e.schoolImpact !== 'No effect'; }).length + ' of ' + school.length + ' recorded school days' : 'Not recorded') + '</dd></div></dl></div>' : '') + '<p class="page-footer">A summary can help you explain your experience at a visit.</p>';
  }
  function renderSettings() {
    const s = state.data.settings;
    main.innerHTML = heading('Make it yours', 'Your space. Your pace.', 'A few preferences, and a way to keep your notes safe.') + '<div class="settings-grid"><section class="card"><div class="section-heading"><span class="section-icon">' + icon('sliders') + '</span><div><h2>The little preferences</h2><p>Simple, just like your notebook.</p></div></div><form id="settings-form"><div class="field"><label class="label" for="med-name">Medication label</label><input id="med-name" name="medicationName" type="text" maxlength="80" value="' + esc(s.medicationName) + '"><p class="hint">Optional. This labels your log; it does not set a treatment plan.</p></div><div class="field"><label class="label" for="med-time">Usual evening pill time</label><input id="med-time" name="medicationTime" type="time" value="' + esc(s.medicationTime) + '"></div><div class="field"><label class="label" for="theme-select">Notebook look</label><select id="theme-select" name="theme"><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Daylight</option><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>After hours</option><option value="system"' + (s.theme === 'system' ? ' selected' : '') + '>Match my phone</option></select></div><div class="settings-actions"><button class="button primary" type="submit">Save preferences</button></div></form></section><section class="card"><div class="section-heading"><span class="section-icon mint">' + icon('lock') + '</span><div><h2>Keep your pages</h2><p>' + state.data.entries.length + ' saved ' + (state.data.entries.length === 1 ? 'day' : 'days') + ' on this browser</p></div></div><p>Your entries stay in this browser on this device. Daylight does not send diary entries to a server or sync them between devices.</p><div class="settings-actions"><button class="button primary full" data-action="export-backup">' + icon('down') + 'Export backup</button><button class="button outline" data-action="import-backup">Import backup</button><button class="button outline" data-action="export-csv">Export CSV</button></div><div class="storage-note"><p><strong>Keep an occasional backup.</strong> Private Browsing, clearing website data, or your phone’s storage management can remove local notes. A backup lets you move to another device.</p><p>Backups contain saved notes. Save a draft first. Exported files include your notes and are not encrypted.</p></div></section><section class="card"><div class="section-heading"><span class="section-icon peach">' + icon('plus') + '</span><div><h2>A home on your Home Screen</h2><p>One little icon. Easy to come back to.</p></div></div><ol class="install-steps"><li>Open this site in <strong>Safari</strong> on your iPhone.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li><li>If shown, keep <strong>Open as Web App</strong> on. Tap <strong>Add</strong>.</li><li>Open Daylight from its new icon, then use that same app for your notes.</li></ol><p class="storage-note">Safari and an installed web app may keep separate storage. If you already have notes in Safari, export a backup and import it after installing.</p><p class="hint" id="offline-status">' + (state.offline ? 'Offline app files are ready on this device.' : 'Offline app files become available after a successful online visit when supported.') + '</p></section><section class="card"><h2>A little care for your data</h2><p>The app has no analytics, external fonts, or third-party diary services. Local storage is not password-protected or encrypted by Daylight. Someone with access to this browser may be able to read it.</p><p>Share a visit summary from Patterns, or export a CSV of your daily details. JSON backups can be imported into Daylight.</p><div class="settings-actions"><button class="button outline" data-action="print-notebook">Print saved notes</button></div><div class="storage-note"><p><strong>Start fresh</strong></p><p>Erase all saved notes and drafts on this browser. Export a backup first if you want to keep them.</p><button class="link-button text-danger" data-action="erase-notebook">Erase this notebook</button></div></section></div><p class="page-footer">Daylight · a notebook for observations, not a diagnosis.</p>';
    document.getElementById('settings-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const next = C.settings({ medicationName: form.elements.medicationName.value, medicationTime: form.elements.medicationTime.value, theme: form.elements.theme.value });
      if (commit(function (data) { data.settings = next; return data; })) { applyTheme(); toast('Your notebook, your way.'); }
    });
  }
  function render() {
    applyTheme();
    document.querySelectorAll('[data-nav]').forEach(function (button) {
      if (button.dataset.nav === state.view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (state.view === 'today') renderToday();
    else if (state.view === 'history') renderHistory();
    else if (state.view === 'patterns') renderPatterns();
    else renderSettings();
    document.title = 'Daylight · ' + ({ today: 'Today', history: 'Notebook', patterns: 'Patterns', settings: 'Settings' })[state.view];
  }
  function navigate(view) {
    persistDraft();
    state.view = view;
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  function changeDate(date) {
    if (!C.validDate(date)) { toast('Choose today or an earlier date.'); document.getElementById('entry-date').value = state.date; return; }
    persistDraft();
    state.date = date;
    render();
  }
  function rangeEntries() {
    return C.inRange(state.data.entries, state.view === 'history' ? state.historyRange : state.view === 'patterns' ? state.patternRange : 'all');
  }
  async function download(text, filename, mime, share) {
    const file = new File([text], filename, { type: mime });
    if (share && /iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Daylight notebook' }); toast('File shared.'); return; } catch (err) { if (err.name === 'AbortError') return; }
      // If the share sheet is unavailable, offer a regular file download.
    }
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    toast('Export ready. Keep the file somewhere safe.');
  }
  function installModal() {
    modal('Keep Daylight close', '<p>On your iPhone, open this site in <strong>Safari</strong>, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Keep <strong>Open as Web App</strong> on if shown, and tap <strong>Add</strong>.</p><p>Open the new Daylight icon and use it for future notes. If you have already saved notes in Safari, export a backup first and import it in the installed app.</p><p>Visit online once so the app can prepare its offline files.</p>');
  }
  document.addEventListener('click', function (event) {
    const nav = event.target.closest('[data-nav]');
    if (nav) { navigate(nav.dataset.nav); return; }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'privacy') modal('Your notebook stays here', '<p>Your diary is saved in <strong>this browser on this device</strong>. The app does not upload entries or sync them to another phone.</p><p>Use Export backup in Settings before clearing website data or changing devices. Files you export contain your notes, so choose where you share them.</p><p>Daylight does not add a password or encryption to local storage.</p>');
    else if (action === 'close-dialog') closeModal();
    else if (action === 'install') installModal();
    else if (action === 'zero-score' || action === 'clear-score') { setScore(button.dataset.name, action === 'zero-score' ? 0 : null); changed(); }
    else if (action === 'clear-choice') { document.querySelectorAll('#diary-form input[type="radio"][name="' + button.dataset.name + '"]').forEach(function (input) { input.checked = false; }); syncConditional(); changed(); }
    else if (action === 'today-date') changeDate(C.today());
    else if (action === 'overwrite-entry') saveEntry(true);
    else if (action === 'range') { state[button.dataset.rangeType === 'history' ? 'historyRange' : 'patternRange'] = button.dataset.value; render(); }
    else if (action === 'edit-entry') { persistDraft(); state.date = button.dataset.date; navigate('today'); }
    else if (action === 'clear-draft') modal('Reset this form?', '<p>This clears the fields on this page and removes its draft. An already saved note stays in your notebook until you update or delete it.</p>', '<button class="button outline" data-action="close-dialog">Keep editing</button><button class="button primary" data-action="confirm-reset">Reset form</button>');
    else if (action === 'confirm-reset') {
      closeModal(); clearTimeout(draftTimer);
      state.drafts[state.date] = { entry: C.blank(state.date), savedAt: new Date().toISOString() };
      try { if (!state.storageBlocked) localStorage.setItem(C.DRAFT, JSON.stringify(state.drafts)); } catch (_) { showStorageError('The cleared draft could not be saved locally.'); }
      render(); toast('Form cleared. Saved notes are unchanged.');
    }
    else if (action === 'delete-entry') {
      modal('Delete this page?', '<p>Delete the saved note for <strong>' + esc(pretty(button.dataset.date)) + '</strong>? This cannot be undone without a backup.</p>', '<button class="button outline" data-action="close-dialog">Keep page</button><button class="button danger" data-action="confirm-delete" data-date="' + button.dataset.date + '">Delete page</button>');
    }
    else if (action === 'confirm-delete') {
      const date = button.dataset.date;
      if (commit(function (data) { data.entries = data.entries.filter(function (e) { return e.date !== date; }); return data; })) {
        delete state.drafts[date];
        try { localStorage.setItem(C.DRAFT, JSON.stringify(state.drafts)); } catch (_) { /* Saved entries remain authoritative. */ }
        closeModal(); render(); toast('Page deleted.');
      }
    }
    else if (action === 'export-backup') { persistDraft(); download(JSON.stringify(Object.assign({}, state.data, { exportedAt: new Date().toISOString() }), null, 2), 'Daylight-backup-' + C.today() + '.json', 'application/json', true); }
    else if (action === 'export-csv') {
      const entries = rangeEntries();
      if (!entries.length) { toast('Save a note first, then export your notebook.'); return; }
      download(C.csv(entries), 'Daylight-notes-' + C.today() + '.csv', 'text/csv;charset=utf-8', true);
    }
    else if (action === 'share-summary') {
      const entries = rangeEntries();
      if (entries.length) download(C.summary(entries, rangeLabel(state.patternRange), state.data.settings.medicationName), 'Daylight-visit-summary-' + C.today() + '.txt', 'text/plain;charset=utf-8', true);
    }
    else if (action === 'import-backup') { const input = document.getElementById('import-file'); input.value = ''; input.click(); }
    else if (action === 'confirm-import') {
      const incoming = state.pendingImport;
      if (!incoming) return;
      const restoreSettings = document.getElementById('restore-settings').checked;
      if (commit(function (data) { data.entries = C.merge(data.entries, incoming.entries); if (restoreSettings) data.settings = incoming.settings; return data; })) {
        state.pendingImport = null;
        closeModal(); render(); toast('Backup merged. Your notebook is ready.');
      }
    }
    else if (action === 'print-notebook') { navigate('history'); state.historyRange = 'all'; state.search = ''; render(); document.querySelectorAll('.entry-expanded').forEach(function (el) { el.open = true; }); window.print(); }
    else if (action === 'erase-notebook') modal('Erase this notebook?', '<p>This permanently removes <strong>all saved notes and drafts</strong> in this browser. Export a backup first if you want to keep them.</p><label class="label" for="erase-confirm">Type DELETE to confirm</label><input id="erase-confirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">', '<button class="button outline" data-action="close-dialog">Keep notebook</button><button id="erase-button" class="button danger" data-action="confirm-erase" disabled>Erase notes</button>');
    else if (action === 'confirm-erase') {
      if (document.getElementById('erase-confirm').value !== 'DELETE') return;
      if (commit(function (data) { data.entries = []; return data; })) {
        state.drafts = {};
        try { localStorage.removeItem(C.DRAFT); } catch (_) { /* Show an explicit failure if a remaining draft cannot be erased. */ showStorageError('Saved notes were erased, but draft removal failed. Try again before closing.'); }
        closeModal(); render(); toast('A fresh page. Your notes have been erased.');
      }
    }
    else if (action === 'recover-storage') download(state.rawStored, 'Daylight-recovery-' + C.today() + '.json', 'application/json', true);
    else if (action === 'retry-storage') {
      try {
        const latest = readLatest();
        localStorage.setItem('daylight.storage-check', '1'); localStorage.removeItem('daylight.storage-check');
        state.data = latest; state.storageBlocked = false; state.rawStored = ''; document.getElementById('storage-banner').hidden = true;
        persistDraft(); toast('Local saving is available again.');
      } catch (_) { toast('Storage is still unavailable. Existing notes have not been changed.'); }
    }
  });
  main.addEventListener('input', function (event) {
    const target = event.target;
    if (target.id === 'history-search') { state.search = target.value; renderHistoryList(); return; }
    if (!target.closest('#diary-form')) return;
    if (target.dataset.score) setScore(target.dataset.score, Number(target.value));
    syncConditional();
    changed();
  });
  main.addEventListener('change', function (event) {
    if (event.target.id === 'entry-date' && event.target.value) { changeDate(event.target.value); return; }
    if (event.target.closest('#diary-form')) { syncConditional(); changed(); }
  });
  dialog.addEventListener('input', function (event) { if (event.target.id === 'erase-confirm') document.getElementById('erase-button').disabled = event.target.value !== 'DELETE'; });
  dialog.addEventListener('cancel', function () { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
  document.getElementById('import-file').addEventListener('change', async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Choose a JSON backup smaller than 5 MB.'); return; }
    try {
      const incoming = C.readBackup(await file.text());
      state.pendingImport = incoming;
      const overlap = incoming.entries.filter(function (e) { return state.data.entries.some(function (x) { return x.date === e.date; }); }).length;
      modal('Bring your notes back', '<p>This backup contains <strong>' + incoming.entries.length + ' saved ' + (incoming.entries.length === 1 ? 'day' : 'days') + '</strong>. ' + overlap + ' dates already exist here.</p><p>Notes will be merged. For the same date, the more recently saved version wins. Your other dates stay as they are.</p><label class="chip" style="justify-content:flex-start"><input id="restore-settings" type="checkbox"><span>Also restore medication and appearance preferences</span></label>', '<button class="button outline" data-action="close-dialog">Cancel</button><button class="button primary" data-action="confirm-import">Merge notes</button>');
    } catch (err) { modal('That backup could not be opened', '<p>' + esc(err.message) + '</p><p>Your existing notes have not been changed.</p>'); }
  });
  window.addEventListener('pagehide', persistDraft);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') persistDraft(); });
  window.addEventListener('storage', function (event) {
    if (event.key !== C.STORE) return;
    try {
      state.data = event.newValue ? C.readBackup(event.newValue) : C.empty();
      if (state.view !== 'today' && state.view !== 'settings') render();
      toast('Notebook updated in another tab.');
    } catch (_) { showStorageError('A change from another tab could not be read. Your form has been kept.'); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (state.data.settings.theme === 'system') applyTheme(); });
  load();
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () {
      state.offline = true;
      const status = document.getElementById('offline-status');
      if (status) status.textContent = 'Offline app files are ready on this device.';
    }).catch(function () { /* Online use and local notes remain available if offline installation is blocked. */ });
  }
})();
