'use strict';

const STORAGE_KEY = 'cadet-attendance-id-v1';
const LEGACY_KEY = 'cadet-attendance-id-legacy';
const TWO_HOURS = 2 * 60 * 60 * 1000;
const state = { data: loadData(), currentActivityId: null, sortMode: 'arrival', stream: null, scanning: false, lastDecoded: '', lastDecodedAt: 0 };

const el = id => document.getElementById(id);
const video = el('video');
const canvas = el('scanCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function todayISO() { return new Intl.DateTimeFormat('en-CA').format(new Date()); }
function defaultActivityName() { return `Home Training Parade ${todayISO()}`; }
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.activities) return saved;
  } catch {}
  return { activities: [], lastOpenActivityId: null };
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); }
function currentActivity() { return state.data.activities.find(a => a.id === state.currentActivityId) || null; }
function normaliseId(value) { return String(value ?? '').trim(); }
function validId(value) { return /^\d+$/.test(value); }
function normaliseName(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function duplicateKey(value) { return normaliseId(value); }
function duplicateNameKey(value) { return normaliseName(value).toLocaleLowerCase('en-AU'); }
function formatTime(iso) { return new Intl.DateTimeFormat('en-AU', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(iso)); }
function formatDateTime(iso) { return new Intl.DateTimeFormat('en-AU', { dateStyle:'medium', timeStyle:'short' }).format(new Date(iso)); }
function setStatus(message, kind='normal') {
  el('status').textContent = message;
  el('status').style.background = kind === 'success' ? '#dcfce7' : kind === 'error' ? '#fee2e2' : '#eef2ff';
}

// Lazily-created AudioContext used to play a short confirmation "ding" on a successful scan.
let audioCtx = null;
function playDing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {}
}

function addCadet(rawValue, method) {
  const activity = currentActivity();
  if (!activity || activity.closedAt) return;

  const value = String(rawValue ?? '').trim();
  if (!value) return setStatus('Enter or scan a cadet ID, or type a cadet name for manual entry.', 'error');

  const isQr = method === 'QR';
  const isNumeric = validId(value);

  // QR codes remain strictly numeric. Names are only allowed through manual entry.
  if (isQr && !isNumeric) {
    return setStatus('Invalid QR code. This version only accepts numeric cadet IDs from QR codes.', 'error');
  }

  if (isNumeric) {
    const cadetId = normaliseId(value);
    const existing = activity.records.find(r => r.entryType !== 'name' && duplicateKey(r.cadetId) === duplicateKey(cadetId));
    if (existing) {
      el('duplicateText').textContent = `ID ${existing.cadetId} was already recorded at ${formatTime(existing.arrivedAt)}.`;
      el('duplicateDialog').showModal();
      setStatus(`Duplicate ignored: ${existing.cadetId}`, 'error');
      return;
    }
    activity.records.push({ id:makeId(), entryType:'id', cadetId, manualName:'', arrivedAt:new Date().toISOString(), method, pcf:false });
    saveData(); render();
    setStatus(`Added ID: ${cadetId}`, 'success');
    if (navigator.vibrate) navigator.vibrate(80);
    if (isQr) playDing();
    return;
  }

  if (isQr) return;

  const manualName = normaliseName(value);
  if (manualName.length < 2) return setStatus('Enter a cadet name, or a numeric cadet ID.', 'error');
  const existingName = activity.records.find(r => r.entryType === 'name' && duplicateNameKey(r.manualName) === duplicateNameKey(manualName));
  if (existingName) {
    el('duplicateText').textContent = `${existingName.manualName} was already entered manually at ${formatTime(existingName.arrivedAt)}.`;
    el('duplicateDialog').showModal();
    setStatus(`Duplicate manual name ignored: ${manualName}`, 'error');
    return;
  }

  activity.records.push({ id:makeId(), entryType:'name', cadetId:'', manualName, arrivedAt:new Date().toISOString(), method:'Manual Name', pcf:false });
  saveData(); render();
  setStatus(`Added manual name: ${manualName}`, 'success');
}
function render() {
  const activity = currentActivity();
  if (!activity) { el('appMain').hidden = true; return; }
  el('appMain').hidden = false;
  el('activityTitle').textContent = activity.name;
  const activityTypeLabel = activity.type === 'other' ? 'Other Activity' : 'Home Training Parade';
  el('activityMeta').textContent = activity.closedAt
    ? `${activityTypeLabel} · Closed ${formatDateTime(activity.closedAt)}`
    : `${activityTypeLabel} · Started ${formatDateTime(activity.createdAt)}`;
  el('count').textContent = activity.records.length;
  const isClosed = Boolean(activity.closedAt);
  el('closedPanel').hidden = !isClosed;
  el('scannerControls').hidden = isClosed;
  if (isClosed) {
    el('closedPanelText').textContent = `Closed at ${formatTime(activity.closedAt)}. No further attendance can be recorded. The list remains available for viewing and export.`;
  }
  document.querySelectorAll('.active-only').forEach(node => node.hidden = isClosed);
  el('emptyMessage').hidden = activity.records.length > 0;
  const records = [...activity.records];
  if (state.sortMode === 'alphabetical') {
    records.sort((a,b) => {
      const aKey = a.entryType === 'name' ? (a.manualName || '') : (a.cadetId || '');
      const bKey = b.entryType === 'name' ? (b.manualName || '') : (b.cadetId || '');
      return aKey.localeCompare(bKey, 'en-AU', { numeric:true, sensitivity:'base' });
    });
  } else records.sort((a,b) => new Date(a.arrivedAt) - new Date(b.arrivedAt));
  el('attendanceList').replaceChildren(...records.map((record, index) => {
    const li = document.createElement('li');
    li.className = activity.type === 'other' ? 'with-pcf' : '';
    li.innerHTML = `<span class="index">${index+1}</span><div><div class="name"></div><div class="meta">${formatTime(record.arrivedAt)} · ${record.method}</div></div>`;
    const isManualName = record.entryType === 'name' || (!record.cadetId && record.manualName);
    li.querySelector('.name').textContent = isManualName ? `${record.manualName} (manual name)` : `ID ${record.cadetId}`;
    if (activity.type === 'other') {
      const label = document.createElement('label'); label.className = 'pcf-check';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(record.pcf); checkbox.disabled = Boolean(activity.closedAt);
      checkbox.addEventListener('change', () => { record.pcf = checkbox.checked; saveData(); });
      label.append(checkbox, document.createTextNode('PCF'));
      li.appendChild(label);
    }
    if (!activity.closedAt) {
      const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${isManualName ? record.manualName : `ID ${record.cadetId}`}`);
      remove.addEventListener('click', () => removeRecord(record.id)); li.appendChild(remove);
    }
    return li;
  }));
  el('sortToggle').textContent = state.sortMode === 'arrival' ? 'Sort: Arrival' : 'Sort: ID / Name';
}

function removeRecord(id) {
  const activity = currentActivity();
  const record = activity?.records.find(r => r.id === id);
  if (!record || activity.closedAt) return;
  const label = record.entryType === 'name' ? record.manualName : `ID ${record.cadetId}`;
  if (!confirm(`Remove ${label} from attendance?`)) return;
  activity.records = activity.records.filter(r => r.id !== id); saveData(); render();
}

async function startCamera() {
  const activity = currentActivity();
  if (!activity || activity.closedAt) return;
  if (!navigator.mediaDevices?.getUserMedia) return setStatus('Camera access is not supported in this browser.', 'error');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } } });
    video.srcObject = state.stream; await video.play();
    state.scanning = true; el('cameraShell').classList.remove('hidden');
    el('startCamera').disabled = true; el('stopCamera').disabled = false;
    setStatus('Camera active. Hold the QR code inside the frame.');
    requestAnimationFrame(scanFrame);
  } catch (error) { setStatus(`Unable to start camera: ${error.message}`, 'error'); }
}
function stopCamera() {
  state.scanning = false;
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null; video.srcObject = null;
  el('cameraShell').classList.add('hidden'); el('startCamera').disabled = false; el('stopCamera').disabled = true;
  if (currentActivity() && !currentActivity().closedAt) setStatus('Camera stopped.');
}
function scanFrame() {
  if (!state.scanning) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && typeof jsQR === 'function') {
    const maxWidth = 900, scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts:'dontInvert' });
    if (code?.data) {
      const now = Date.now();
      if (code.data !== state.lastDecoded || now - state.lastDecodedAt > 2500) {
        state.lastDecoded = code.data; state.lastDecodedAt = now; addCadet(code.data, 'QR');
      }
    }
  }
  requestAnimationFrame(scanFrame);
}

function csvEscape(value) { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function safeFilename(value) { return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g,'').slice(0,80) || 'cadet-attendance'; }
function exportCsv() {
  const activity = currentActivity();
  if (!activity?.records.length) return setStatus('There are no attendance records to export.', 'error');

  // Only exports numeric cadet IDs, in arrival order, as a single comma-separated line
  // (manual name entries have no ID and are excluded from this export).
  const byArrival = (a,b) => new Date(a.arrivedAt) - new Date(b.arrivedAt);
  const ids = activity.records
    .filter(r => r.entryType !== 'name' && r.cadetId)
    .sort(byArrival)
    .map(r => r.cadetId);

  if (!ids.length) return setStatus('There are no cadet IDs to export.', 'error');

  const csv = ids.join(',');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const file = new File([blob], `${safeFilename(activity.name)}.csv`, { type:'text/csv' });
  if (navigator.share && navigator.canShare?.({ files:[file] })) navigator.share({ files:[file], title:activity.name }).catch(() => {});
  else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=file.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
function createActivity() {
  const type = el('activityType').value;
  const name = el('activityName').value.trim() || (type === 'home' ? defaultActivityName() : `Other Activity ${todayISO()}`);
  const activity = { id:makeId(), name, type, createdAt:new Date().toISOString(), closedAt:null, records:[] };
  state.data.activities.push(activity); state.data.lastOpenActivityId = activity.id; state.currentActivityId = activity.id; saveData();
  el('newActivityDialog').close(); render(); setStatus('New activity created.');
}
function closeCurrentActivity() {
  const activity = currentActivity();
  if (!activity || activity.closedAt || !confirm(`Close “${activity.name}”? New attendance entries will be disabled.`)) return;
  stopCamera(); activity.closedAt = new Date().toISOString(); state.data.lastOpenActivityId = null; saveData(); render();
}
function openActivity(activity) {
  state.currentActivityId = activity.id;
  state.data.lastOpenActivityId = activity.closedAt ? state.data.lastOpenActivityId : activity.id;
  saveData();
  el('pastActivityDialog').close();
  if (el('launchDialog').open) el('launchDialog').close();
  render();
}

function deleteCompletedActivity(activityId) {
  const activity = state.data.activities.find(a => a.id === activityId);
  if (!activity?.closedAt) return;
  if (!confirm(`Permanently delete the completed activity “${activity.name}” and its ${activity.records.length} attendance record${activity.records.length === 1 ? '' : 's'}? This cannot be undone.`)) return;

  state.data.activities = state.data.activities.filter(a => a.id !== activityId);
  if (state.currentActivityId === activityId) {
    stopCamera();
    state.currentActivityId = null;
    el('appMain').hidden = true;
    el('activityTitle').textContent = 'No activity selected';
    el('activityMeta').textContent = '';
    el('count').textContent = '0';
  }
  if (state.data.lastOpenActivityId === activityId) state.data.lastOpenActivityId = null;
  saveData();
  showPastActivities(true);
}

function deleteAllCompletedActivities() {
  const completed = state.data.activities.filter(a => Boolean(a.closedAt));
  if (!completed.length) return;
  const records = completed.reduce((sum, activity) => sum + activity.records.length, 0);
  if (!confirm(`Permanently delete all ${completed.length} completed activit${completed.length === 1 ? 'y' : 'ies'} and ${records} attendance record${records === 1 ? '' : 's'}? Open activities will not be deleted. This cannot be undone.`)) return;

  const deletedIds = new Set(completed.map(a => a.id));
  state.data.activities = state.data.activities.filter(a => !deletedIds.has(a.id));
  if (deletedIds.has(state.currentActivityId)) {
    stopCamera();
    state.currentActivityId = null;
    el('appMain').hidden = true;
    el('activityTitle').textContent = 'No activity selected';
    el('activityMeta').textContent = '';
    el('count').textContent = '0';
  }
  if (deletedIds.has(state.data.lastOpenActivityId)) state.data.lastOpenActivityId = null;
  saveData();
  showPastActivities(true);
}

function showPastActivities(refreshOnly = false) {
  const list = el('pastActivityList'); list.replaceChildren();
  const activities = [...state.data.activities].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const completedCount = activities.filter(a => Boolean(a.closedAt)).length;
  el('noPastActivities').hidden = activities.length > 0;
  el('deleteAllCompleted').hidden = completedCount === 0;
  el('deleteAllCompleted').textContent = completedCount === 1 ? 'Delete completed activity' : `Delete all completed (${completedCount})`;

  for (const activity of activities) {
    const row = document.createElement('div'); row.className = 'activity-row';
    const button = document.createElement('button'); button.className = 'activity-item';
    button.innerHTML = `<strong></strong><span>${activity.type === 'other' ? 'Other Activity' : 'Home Training Parade'} · ${activity.records.length} present</span><span>${formatDateTime(activity.createdAt)} · ${activity.closedAt ? 'Closed' : 'Open'}</span>`;
    button.querySelector('strong').textContent = activity.name;
    button.addEventListener('click', () => openActivity(activity));
    row.appendChild(button);

    if (activity.closedAt) {
      const remove = document.createElement('button');
      remove.className = 'delete-activity';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete completed activity ${activity.name}`);
      remove.addEventListener('click', () => deleteCompletedActivity(activity.id));
      row.appendChild(remove);
    }
    list.appendChild(row);
  }
  if (!refreshOnly && !el('pastActivityDialog').open) el('pastActivityDialog').showModal();
}
function prepareNewActivity() {
  el('activityType').value = 'home'; el('activityName').value = defaultActivityName(); el('newActivityDialog').showModal();
}
function startup() {
  const openActivity = state.data.activities.find(a => a.id === state.data.lastOpenActivityId && !a.closedAt);
  if (!openActivity) return el('launchDialog').showModal();
  const age = Date.now() - new Date(openActivity.createdAt).getTime();
  if (age <= TWO_HOURS) { state.currentActivityId = openActivity.id; render(); return; }
  el('resumeText').textContent = `“${openActivity.name}” was started ${formatDateTime(openActivity.createdAt)}. Is it still in progress?`;
  el('resumeDialog').showModal();
}

el('startCamera').addEventListener('click', startCamera);
el('stopCamera').addEventListener('click', stopCamera);
el('addManual').addEventListener('click', () => { addCadet(el('manualName').value, 'Manual'); el('manualName').value=''; el('manualName').focus(); });
el('manualName').addEventListener('keydown', e => { if (e.key === 'Enter') el('addManual').click(); });
el('sortToggle').addEventListener('click', () => { state.sortMode = state.sortMode === 'arrival' ? 'alphabetical' : 'arrival'; render(); });
el('exportCsv').addEventListener('click', exportCsv);
el('undoLast').addEventListener('click', () => { const activity=currentActivity(); if (!activity?.records.length) return; const latest=[...activity.records].sort((a,b)=>new Date(b.arrivedAt)-new Date(a.arrivedAt))[0]; removeRecord(latest.id); });
el('closeActivity').addEventListener('click', closeCurrentActivity);
el('changeActivity').addEventListener('click', () => showPastActivities());
el('closeDuplicate').addEventListener('click', () => el('duplicateDialog').close());
el('newActivityButton').addEventListener('click', () => { el('launchDialog').close(); prepareNewActivity(); });
el('pastActivityButton').addEventListener('click', () => showPastActivities());
el('cancelNewActivity').addEventListener('click', () => { el('newActivityDialog').close(); if (!currentActivity()) el('launchDialog').showModal(); });
el('createActivity').addEventListener('click', createActivity);
el('activityType').addEventListener('change', () => { el('activityName').value = el('activityType').value === 'home' ? defaultActivityName() : `Other Activity ${todayISO()}`; });
el('newFromActivities').addEventListener('click', () => { el('pastActivityDialog').close(); prepareNewActivity(); });
el('closePastActivities').addEventListener('click', () => { el('pastActivityDialog').close(); if (!currentActivity()) el('launchDialog').showModal(); });
el('deleteAllCompleted').addEventListener('click', deleteAllCompletedActivities);
el('resumeActivity').addEventListener('click', () => { const activity=state.data.activities.find(a=>a.id===state.data.lastOpenActivityId); if (activity) { state.currentActivityId=activity.id; el('resumeDialog').close(); render(); } });
el('closeAndStart').addEventListener('click', () => { const activity=state.data.activities.find(a=>a.id===state.data.lastOpenActivityId); if (activity) activity.closedAt=new Date().toISOString(); state.data.lastOpenActivityId=null; saveData(); el('resumeDialog').close(); el('launchDialog').showModal(); });
el('viewActivitiesInstead').addEventListener('click', () => { el('resumeDialog').close(); showPastActivities(); });
window.addEventListener('pagehide', stopCamera);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=20260810-1', { updateViaCache: 'none' }).catch(console.error);
startup();
