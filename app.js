/**
 * FitSync Mobile - Application Logic
 * Optimized for Safari on iPhone 15 Pro Max & GitHub Pages
 * Handles file loading, pace syncing, segment editing, live timeline,
 * workout processing, iOS Share Sheet, and LocalStorage profiles.
 */

(function () {
  'use strict';

  // --- Global State ---
  const state = {
    aBuffer: null,
    aFileName: 'A.fit',
    decodedA: null,
    qBuffer: null,
    qFileName: '',
    decodedQ: null,
    syncData: null,
    workoutMode: 'repeats', // 'repeats' or 'custom_segments'
    customSegments: [
      { id: 1, name: "Warm Up", durationMin: 14, speedKmh: 10.6, paceStr: "5:40", intensity: "Active", autoCalc: false },
      { id: 2, name: "Interval 1", durationMin: 10, speedKmh: 13.7, paceStr: "4:23", intensity: "Active", autoCalc: false },
      { id: 3, name: "Recovery 1", durationMin: 2, speedKmh: 5.7, paceStr: "10:32", intensity: "Resting", autoCalc: false },
      { id: 4, name: "Interval 2", durationMin: 10, speedKmh: 13.7, paceStr: "4:23", intensity: "Active", autoCalc: false },
      { id: 5, name: "Recovery 2", durationMin: 2, speedKmh: 5.7, paceStr: "10:32", intensity: "Resting", autoCalc: false },
      { id: 6, name: "Cool Down", durationMin: 0, speedKmh: 10.6, paceStr: "5:40", intensity: "Active", autoCalc: true }
    ],
    generatedOutputs: null
  };

  // --- Presets ---
  const PRESETS = [
    {
      name: '3×10m @ 13.7 (12km)',
      wuMin: 14, wuKmh: 10.6,
      repeats: 3, intMin: 10, intKmh: 13.7, recMin: 2, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 12.0
    },
    {
      name: '5×3m @ 14.2 (8.4km)',
      wuMin: 13, wuKmh: 10.6,
      repeats: 5, intMin: 3, intKmh: 14.2, recMin: 1, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 8.44
    },
    {
      name: '3×5m @ 13.7 (8.4km)',
      wuMin: 14, wuKmh: 10.6,
      repeats: 3, intMin: 5, intKmh: 13.7, recMin: 1.333, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 8.42
    },
    {
      name: '5×6m @ 14.2 (12.1km)',
      wuMin: 13, wuKmh: 10.6,
      repeats: 5, intMin: 6, intKmh: 14.2, recMin: 1.5, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 12.09
    }
  ];

  // --- DOM Elements ---
  // A.fit elements
  const aDropzone = document.getElementById('a-dropzone');
  const aFileInput = document.getElementById('a-file-input');
  const aStatusBox = document.getElementById('a-status-box');
  const aFileNameText = document.getElementById('a-file-name-text');
  const aChangeBtn = document.getElementById('a-change-btn');
  const aRecordsCount = document.getElementById('a-records-count');
  const aDurationText = document.getElementById('a-duration-text');
  const aHrRange = document.getElementById('a-hr-range');
  const aStationaryCount = document.getElementById('a-stationary-count');

  // Q.fit elements
  const qDropzone = document.getElementById('q-dropzone');
  const qFileInput = document.getElementById('q-file-input');
  const qStatusBox = document.getElementById('q-status-box');
  const qFileNameText = document.getElementById('q-file-name-text');
  const qChangeBtn = document.getElementById('q-change-btn');
  const qRecordsCount = document.getElementById('q-records-count');
  const qDurationText = document.getElementById('q-duration-text');
  const qMaxSpd = document.getElementById('q-max-spd');
  const qPhasesCount = document.getElementById('q-phases-count');

  // Sync elements
  const syncBanner = document.getElementById('sync-banner');
  const syncDescText = document.getElementById('sync-desc-text');
  const syncActionRow = document.getElementById('sync-action-row');
  const syncPhasesPill = document.getElementById('sync-phases-pill');
  const autofillQBtn = document.getElementById('autofill-q-btn');

  // Mode Buttons
  const modeRepeatsBtn = document.getElementById('mode-repeats-btn');
  const modeSegmentsBtn = document.getElementById('mode-segments-btn');
  const repeatsPane = document.getElementById('repeats-pane');
  const segmentsPane = document.getElementById('segments-pane');

  // Repeats Inputs
  const wuDurIn = document.getElementById('wu-dur');
  const wuKmhIn = document.getElementById('wu-kmh');
  const wuPaceIn = document.getElementById('wu-pace');
  const wuDistEst = document.getElementById('wu-dist-est');
  const repCountIn = document.getElementById('rep-count');
  const intDurIn = document.getElementById('int-dur');
  const intKmhIn = document.getElementById('int-kmh');
  const intPaceIn = document.getElementById('int-pace');
  const recDurIn = document.getElementById('rec-dur');
  const recKmhIn = document.getElementById('rec-kmh');
  const recPaceIn = document.getElementById('rec-pace');
  const cdKmhIn = document.getElementById('cd-kmh');
  const cdPaceIn = document.getElementById('cd-pace');
  const targetDistIn = document.getElementById('target-dist');
  const cdModeSelect = document.getElementById('cd-mode-select');
  const cdManualGroup = document.getElementById('cd-manual-group');
  const cdManualDurIn = document.getElementById('cd-manual-dur');

  // Segments Inputs
  const segTargetDistIn = document.getElementById('seg-target-dist');
  const addSegmentBtn = document.getElementById('add-segment-btn');
  const addPairBtn = document.getElementById('add-pair-btn');
  const progressionBtn = document.getElementById('progression-btn');
  const recalcFinalBtn = document.getElementById('recalc-final-btn');
  const segmentsList = document.getElementById('segments-list');
  const bannerTarget = document.getElementById('banner-target');
  const bannerPrior = document.getElementById('banner-prior');
  const bannerRemaining = document.getElementById('banner-remaining');

  // Timeline & Stats
  const timelineBar = document.getElementById('timeline-bar');
  const prevDuration = document.getElementById('prev-duration');
  const prevDistance = document.getElementById('prev-distance');
  const prevPace = document.getElementById('prev-pace');
  const prevSpeed = document.getElementById('prev-speed');

  // Device & Settings
  const deviceSelect = document.getElementById('device-select');
  const trimStationaryIn = document.getElementById('trim-stationary');
  const devicePillText = document.getElementById('device-pill-text');

  // Process & Results
  const processBtn = document.getElementById('process-btn');
  const processLoader = document.getElementById('process-loader');
  const resultsCard = document.getElementById('results-card');
  const resTime = document.getElementById('res-time');
  const resDist = document.getElementById('res-dist');
  const resPace = document.getElementById('res-pace');
  const resMaxSpd = document.getElementById('res-max-spd');
  const iosShareBtn = document.getElementById('ios-share-btn');
  const dlZipBtn = document.getElementById('dl-zip-btn');
  const dlTcxBtn = document.getElementById('dl-tcx-btn');
  const dlFitGpsBtn = document.getElementById('dl-fit-gps-btn');
  const dlFitIndoorBtn = document.getElementById('dl-fit-indoor-btn');
  const dlTcxIndoorBtn = document.getElementById('dl-tcx-indoor-btn');
  const dlGpxBtn = document.getElementById('dl-gpx-btn');
  const dlCsvBtn = document.getElementById('dl-csv-btn');
  const toggleLapsBtn = document.getElementById('toggle-laps-btn');
  const lapsContainer = document.getElementById('laps-container');
  const lapsTbody = document.getElementById('laps-tbody');

  // Modals
  const progressionModal = document.getElementById('progression-modal');
  const closeProgModalBtn = document.getElementById('close-prog-modal-btn');
  const cancelProgBtn = document.getElementById('cancel-prog-btn');
  const applyProgBtn = document.getElementById('apply-prog-btn');
  const progIncludeRec = document.getElementById('prog-include-rec');
  const progRecDurGroup = document.getElementById('prog-rec-dur-group');

  const saveProfileModal = document.getElementById('save-profile-modal');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const closeSaveModalBtn = document.getElementById('close-save-modal-btn');
  const cancelSaveModalBtn = document.getElementById('cancel-save-modal-btn');
  const confirmSaveProfileBtn = document.getElementById('confirm-save-profile-btn');
  const saveProfileTitle = document.getElementById('save-profile-title');
  const savedProfilesSelect = document.getElementById('saved-profiles-select');
  const loadProfileBtn = document.getElementById('load-profile-btn');
  const deleteProfileBtn = document.getElementById('delete-profile-btn');
  const exportProfilesBtn = document.getElementById('export-profiles-btn');

  // --- Initializer ---
  function init() {
    setupFileHandlers();
    setupDualPaceBindings();
    setupPresets();
    setupModeSwitch();
    setupSegmentsManager();
    setupDeviceSelect();
    setupProgressionModal();
    setupProfilesManager();
    setupActionButtons();

    autoCalculateFinalSegment();
    renderSegmentsList();
    updateWorkoutPreview();
  }

  // --- Dual File Upload & Sync Analysis ---
  function setupFileHandlers() {
    // A.fit handlers
    if (aDropzone && aFileInput) {
      aDropzone.addEventListener('click', () => aFileInput.click());
      aChangeBtn?.addEventListener('click', () => aFileInput.click());

      aFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleAFile(file);
      });

      setupDropEvents(aDropzone, (file) => handleAFile(file));
    }

    // Q.fit handlers
    if (qDropzone && qFileInput) {
      qDropzone.addEventListener('click', () => qFileInput.click());
      qChangeBtn?.addEventListener('click', () => qFileInput.click());

      qFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleQFile(file);
      });

      setupDropEvents(qDropzone, (file) => handleQFile(file));
    }

    // Autofill button
    autofillQBtn?.addEventListener('click', () => {
      if (state.syncData && state.syncData.detected_q_phases) {
        applyQPhases(state.syncData.detected_q_phases);
      }
    });
  }

  function setupDropEvents(el, onFile) {
    ['dragenter', 'dragover'].forEach(name => {
      el.addEventListener(name, (e) => {
        e.preventDefault();
        el.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      el.addEventListener(name, (e) => {
        e.preventDefault();
        el.classList.remove('dragover');
      });
    });

    el.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }

  function handleAFile(file) {
    state.aFileName = file.name;
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        state.aBuffer = e.target.result;
        state.decodedA = FitEngine.decodeFitBinary(state.aBuffer);

        const recs = state.decodedA.records;
        const count = recs.length;
        const durSec = count;
        const hrs = recs.map(r => r.heart_rate).filter(h => h && h > 30);
        const minHr = hrs.length ? Math.min(...hrs) : '--';
        const maxHr = hrs.length ? Math.max(...hrs) : '--';

        // Count leading stationary
        let statCount = 0;
        for (let i = 0; i < recs.length; i++) {
          const s = recs[i].speed || 0;
          const cad = recs[i].cadence || 0;
          if (s < 0.3 && cad < 40) statCount++;
          else break;
        }

        aFileNameText.innerText = file.name;
        aRecordsCount.innerText = count.toLocaleString();
        aDurationText.innerText = FitEngine.formatDuration(durSec);
        aHrRange.innerText = hrs.length ? `${minHr}-${maxHr}` : 'None';
        aStationaryCount.innerText = `${statCount}s`;

        aDropzone.classList.add('hidden');
        aStatusBox.classList.remove('hidden');

        runSyncAnalysis();
      } catch (err) {
        alert(`Failed to decode A.fit: ${err.message}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function handleQFile(file) {
    state.qFileName = file.name;
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        state.qBuffer = e.target.result;
        state.decodedQ = FitEngine.decodeFitBinary(state.qBuffer);

        const recs = state.decodedQ.records;
        const count = recs.length;
        const durSec = count;
        const spds = recs.map(r => r.speed || 0);
        const maxSpd = spds.length ? (Math.max(...spds) * 3.6).toFixed(1) : '--';

        // Detect treadmill phases
        const qPhases = FitEngine.detectSpeedPhases(recs, 20);

        qFileNameText.innerText = file.name;
        qRecordsCount.innerText = count.toLocaleString();
        qDurationText.innerText = FitEngine.formatDuration(durSec);
        qMaxSpd.innerText = `${maxSpd}k`;
        qPhasesCount.innerText = `${qPhases.length}`;

        qDropzone.classList.add('hidden');
        qStatusBox.classList.remove('hidden');

        runSyncAnalysis();
      } catch (err) {
        alert(`Failed to decode Q.fit: ${err.message}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function runSyncAnalysis() {
    if (!state.decodedQ) return;

    if (state.decodedA) {
      state.syncData = FitEngine.analyzeSync(state.decodedA.records, state.decodedQ.records);
      const clockDiff = state.syncData.clock_offset_sec || 0;
      const moveDiff = state.syncData.movement_offset_sec || 0;
      const statCount = state.syncData.a_leading_stationary_count || 0;
      const phases = state.syncData.detected_q_phases || [];

      let desc = `• <strong>Clock Offset:</strong> Q started ${clockDiff >= 0 ? clockDiff + 's after' : Math.abs(clockDiff) + 's before'} A.<br>`;
      desc += `• <strong>Motion Alignment:</strong> Starts aligned within ${Math.abs(moveDiff)}s.<br>`;
      desc += `• <strong>Stationary Start in Watch:</strong> ${statCount} initial standstill records detected.`;

      syncDescText.innerHTML = desc;

      if (phases.length > 0) {
        syncPhasesPill.innerText = `${phases.length} treadmill phases detected`;
        syncActionRow.classList.remove('hidden');
      } else {
        syncActionRow.classList.add('hidden');
      }

      syncBanner.classList.remove('hidden');
    } else {
      // Only Q is loaded
      const phases = FitEngine.detectSpeedPhases(state.decodedQ.records, 20);
      state.syncData = { detected_q_phases: phases };

      syncDescText.innerHTML = `Loaded treadmill sensor data (${state.decodedQ.records.length} records). Ready to auto-fill intervals!`;
      if (phases.length > 0) {
        syncPhasesPill.innerText = `${phases.length} phases detected`;
        syncActionRow.classList.remove('hidden');
      }
      syncBanner.classList.remove('hidden');
    }
  }

  function applyQPhases(phases) {
    if (!phases || phases.length < 2) {
      alert('Not enough distinct speed phases detected in Q.fit.');
      return;
    }

    if (state.workoutMode === 'custom_segments') {
      // Build custom segments directly from Q phases!
      state.customSegments = phases.map((p, idx) => {
        let name = `Segment ${idx + 1}`;
        let intensity = "Active";
        if (idx === 0) name = "Warm Up";
        else if (idx === phases.length - 1) name = "Cool Down";
        else if (p.speed_kmh < 8.0) {
          name = `Recovery ${Math.floor(idx / 2)}`;
          intensity = "Resting";
        } else {
          name = `Interval ${Math.ceil(idx / 2)}`;
        }

        return {
          id: idx + 1,
          name: name,
          durationMin: p.duration_min,
          speedKmh: p.speed_kmh,
          paceStr: p.pace_str || FitEngine.kmhToPaceStr(p.speed_kmh),
          intensity: intensity,
          autoCalc: (idx === phases.length - 1)
        };
      });

      // Update total target distance estimate
      let totalDistKm = 0;
      phases.forEach(p => {
        totalDistKm += (p.duration_sec * p.speed_ms) / 1000.0;
      });
      segTargetDistIn.value = (Math.round(totalDistKm * 10) / 10).toFixed(1);

      autoCalculateFinalSegment();
      renderSegmentsList();
    } else {
      // Structured repeats mode
      const wu = phases[0];
      wuDurIn.value = wu.duration_min;
      wuKmhIn.value = wu.speed_kmh;
      wuPaceIn.value = FitEngine.kmhToPaceStr(wu.speed_kmh);

      if (phases.length >= 3) {
        const intP = phases[1];
        const recP = phases[2];
        intDurIn.value = intP.duration_min;
        intKmhIn.value = intP.speed_kmh;
        intPaceIn.value = FitEngine.kmhToPaceStr(intP.speed_kmh);

        recDurIn.value = recP.duration_min;
        recKmhIn.value = recP.speed_kmh;
        recPaceIn.value = FitEngine.kmhToPaceStr(recP.speed_kmh);

        const repCount = Math.floor((phases.length - 2) / 2);
        repCountIn.value = Math.max(1, repCount);
      }

      const cd = phases[phases.length - 1];
      cdKmhIn.value = cd.speed_kmh;
      cdPaceIn.value = FitEngine.kmhToPaceStr(cd.speed_kmh);

      let totalDistKm = 0;
      phases.forEach(p => {
        totalDistKm += (p.duration_sec * p.speed_ms) / 1000.0;
      });
      targetDistIn.value = (Math.round(totalDistKm * 10) / 10).toFixed(1);
    }

    updateWorkoutPreview();
    alert(`⚡ Successfully populated ${phases.length} intervals and speeds directly from Q.fit!`);
  }
      }
    };

    reader.readAsArrayBuffer(file);
  }

  // --- 2-Way Pace Sync Helpers ---
  function bindPacePair(kmhIn, paceIn) {
    kmhIn.addEventListener('input', () => {
      const kmh = parseFloat(kmhIn.value) || 0;
      paceIn.value = kmh > 0 ? FitEngine.kmhToPaceStr(kmh) : '';
      updateWorkoutPreview();
    });

    paceIn.addEventListener('input', () => {
      const p = paceIn.value.trim();
      if (p.length >= 3) {
        const kmh = FitEngine.paceStrToKmh(p);
        if (kmh > 0) {
          kmhIn.value = kmh;
          updateWorkoutPreview();
        }
      }
    });
  }

  function setupDualPaceBindings() {
    bindPacePair(wuKmhIn, wuPaceIn);
    bindPacePair(intKmhIn, intPaceIn);
    bindPacePair(recKmhIn, recPaceIn);
    bindPacePair(cdKmhIn, cdPaceIn);

    wuDurIn.addEventListener('input', updateWorkoutPreview);
    repCountIn.addEventListener('input', updateWorkoutPreview);
    intDurIn.addEventListener('input', updateWorkoutPreview);
    recDurIn.addEventListener('input', updateWorkoutPreview);
    targetDistIn.addEventListener('input', updateWorkoutPreview);
    cdModeSelect.addEventListener('change', () => {
      const isManual = cdModeSelect.value === 'manual';
      cdManualGroup.classList.toggle('hidden', !isManual);
      updateWorkoutPreview();
    });
    cdManualDurIn.addEventListener('input', updateWorkoutPreview);
  }

  // --- Presets ---
  function setupPresets() {
    const chips = document.querySelectorAll('.preset-chip');
    chips.forEach((chip, idx) => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        applyPreset(idx);
      });
    });
  }

  function applyPreset(index) {
    const p = PRESETS[index];
    if (!p) return;

    wuDurIn.value = p.wuMin;
    wuKmhIn.value = p.wuKmh;
    wuPaceIn.value = FitEngine.kmhToPaceStr(p.wuKmh);

    repCountIn.value = p.repeats;
    intDurIn.value = p.intMin;
    intKmhIn.value = p.intKmh;
    intPaceIn.value = FitEngine.kmhToPaceStr(p.intKmh);

    recDurIn.value = p.recMin;
    recKmhIn.value = p.recKmh;
    recPaceIn.value = FitEngine.kmhToPaceStr(p.recKmh);

    cdKmhIn.value = p.cdKmh;
    cdPaceIn.value = FitEngine.kmhToPaceStr(p.cdKmh);

    targetDistIn.value = p.targetDistKm;
    cdModeSelect.value = 'auto_distance';
    cdManualGroup.classList.add('hidden');

    updateWorkoutPreview();
  }

  // --- Mode Switching ---
  function setupModeSwitch() {
    modeRepeatsBtn.addEventListener('click', () => switchMode('repeats'));
    modeSegmentsBtn.addEventListener('click', () => switchMode('custom_segments'));
  }

  function switchMode(mode) {
    state.workoutMode = mode;
    if (mode === 'repeats') {
      modeRepeatsBtn.classList.add('active');
      modeSegmentsBtn.classList.remove('active');
      repeatsPane.classList.remove('hidden');
      segmentsPane.classList.add('hidden');
    } else {
      modeSegmentsBtn.classList.add('active');
      modeRepeatsBtn.classList.remove('active');
      segmentsPane.classList.remove('hidden');
      repeatsPane.classList.add('hidden');
      autoCalculateFinalSegment();
      renderSegmentsList();
    }
    updateWorkoutPreview();
  }

  // --- Manual Segments Manager ---
  function setupSegmentsManager() {
    segTargetDistIn.addEventListener('input', () => {
      autoCalculateFinalSegment();
      renderSegmentsList();
      updateWorkoutPreview();
    });

    addSegmentBtn.addEventListener('click', addCustomSegment);
    addPairBtn.addEventListener('click', addIntervalPair);
    recalcFinalBtn.addEventListener('click', () => {
      autoCalculateFinalSegment();
      renderSegmentsList();
      updateWorkoutPreview();
    });
  }

  function autoCalculateFinalSegment() {
    if (!state.customSegments || state.customSegments.length === 0) return;
    const targetDistKm = parseFloat(segTargetDistIn.value) || 0;
    const targetDistM = targetDistKm * 1000.0;

    const num = state.customSegments.length;
    let priorDistM = 0;
    for (let i = 0; i < num - 1; i++) {
      const s = state.customSegments[i];
      const durSec = Math.round((s.durationMin || 0) * 60);
      const spdMs = FitEngine.kmhToMs(s.speedKmh || 0);
      priorDistM += durSec * spdMs;
    }

    const lastIdx = num - 1;
    const lastSeg = state.customSegments[lastIdx];

    bannerTarget.innerText = `${targetDistKm.toFixed(2)} km`;
    bannerPrior.innerText = `${(priorDistM / 1000.0).toFixed(2)} km`;

    if (lastSeg && lastSeg.autoCalc) {
      const remDistM = Math.max(0, targetDistM - priorDistM);
      bannerRemaining.innerText = `${(remDistM / 1000.0).toFixed(2)} km`;

      const spdMs = FitEngine.kmhToMs(lastSeg.speedKmh || 0);
      if (spdMs > 0 && targetDistM > priorDistM) {
        const durSec = Math.round(remDistM / spdMs);
        lastSeg.durationMin = parseFloat((durSec / 60.0).toFixed(2));
      }
    } else {
      if (lastSeg) {
        const lastDist = Math.round((lastSeg.durationMin || 0) * 60) * FitEngine.kmhToMs(lastSeg.speedKmh || 0);
        bannerRemaining.innerText = `${(lastDist / 1000.0).toFixed(2)} km`;
      }
    }
  }

  function renderSegmentsList() {
    segmentsList.innerHTML = '';
    const num = state.customSegments.length;

    state.customSegments.forEach((seg, idx) => {
      const isFinal = (idx === num - 1);
      const durSec = Math.round((seg.durationMin || 0) * 60);
      const spdMs = FitEngine.kmhToMs(seg.speedKmh || 0);
      const distKm = ((durSec * spdMs) / 1000.0).toFixed(2);

      const card = document.createElement('div');
      card.className = `segment-item-card ${seg.autoCalc ? 'auto-calc-active' : ''}`;
      card.dataset.id = seg.id;

      card.innerHTML = `
        <div class="seg-header-row">
          <span class="seg-num-pill">#${idx + 1}</span>
          <input type="text" class="seg-name-in" value="${seg.name || ''}" placeholder="Phase name" style="flex: 1; margin: 0 8px; height: 32px; font-size: 13px;">
          <button type="button" class="btn-xs btn-danger seg-del-btn" title="Delete" ${num <= 1 ? 'disabled style="opacity: 0.3;"' : ''}>🗑️</button>
        </div>
        <div class="seg-inputs-grid">
          <div class="input-group">
            <label>km/h</label>
            <input type="number" class="seg-kmh-in" value="${seg.speedKmh || 0}" step="0.1" inputmode="decimal">
          </div>
          <div class="input-group">
            <label>min/km</label>
            <input type="text" class="seg-pace-in" value="${seg.paceStr || FitEngine.kmhToPaceStr(seg.speedKmh)}" placeholder="4:30">
          </div>
          <div class="input-group">
            <label>Time (min)</label>
            <input type="number" class="seg-dur-in" value="${seg.durationMin || 0}" step="0.1" inputmode="decimal" ${seg.autoCalc ? 'disabled title="Auto calculated"' : ''}>
          </div>
        </div>
        <div class="seg-bottom-row">
          <div style="display: flex; gap: 8px; align-items: center;">
            <select class="seg-int-in" style="height: 28px; font-size: 11px; padding: 0 4px; width: 80px;">
              <option value="Active" ${seg.intensity === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Resting" ${seg.intensity === 'Resting' ? 'selected' : ''}>Resting</option>
            </select>
            <span class="seg-dist-text">${distKm} km</span>
          </div>
          ${isFinal ? `
          <label style="display: flex; align-items: center; gap: 4px; color: var(--accent-purple); cursor: pointer;">
            <input type="checkbox" class="seg-autocalc-toggle" ${seg.autoCalc ? 'checked' : ''} style="width: 16px; height: 16px;">
            <span>Auto-Calc</span>
          </label>
          ` : ''}
        </div>
      `;

      // Event bindings
      const nameIn = card.querySelector('.seg-name-in');
      const kmhIn = card.querySelector('.seg-kmh-in');
      const paceIn = card.querySelector('.seg-pace-in');
      const durIn = card.querySelector('.seg-dur-in');
      const intIn = card.querySelector('.seg-int-in');
      const delBtn = card.querySelector('.seg-del-btn');
      const autoToggle = card.querySelector('.seg-autocalc-toggle');

      nameIn.addEventListener('input', (e) => {
        seg.name = e.target.value;
        updateWorkoutPreview();
      });

      kmhIn.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        seg.speedKmh = val;
        seg.paceStr = FitEngine.kmhToPaceStr(val);
        paceIn.value = seg.paceStr;
        autoCalculateFinalSegment();
        updateWorkoutPreview();
      });

      paceIn.addEventListener('input', (e) => {
        const str = e.target.value.trim();
        if (str.length >= 3) {
          const kmh = FitEngine.paceStrToKmh(str);
          if (kmh > 0) {
            seg.speedKmh = kmh;
            seg.paceStr = str;
            kmhIn.value = kmh;
            autoCalculateFinalSegment();
            updateWorkoutPreview();
          }
        }
      });

      durIn.addEventListener('input', (e) => {
        seg.durationMin = parseFloat(e.target.value) || 0;
        autoCalculateFinalSegment();
        updateWorkoutPreview();
      });

      intIn.addEventListener('change', (e) => {
        seg.intensity = e.target.value;
      });

      delBtn.addEventListener('click', () => {
        if (state.customSegments.length <= 1) return;
        state.customSegments.splice(idx, 1);
        autoCalculateFinalSegment();
        renderSegmentsList();
        updateWorkoutPreview();
      });

      if (autoToggle) {
        autoToggle.addEventListener('change', (e) => {
          seg.autoCalc = e.target.checked;
          autoCalculateFinalSegment();
          renderSegmentsList();
          updateWorkoutPreview();
        });
      }

      segmentsList.appendChild(card);
    });
  }

  function addCustomSegment() {
    const nextId = (state.customSegments.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    // Unset auto-calc on existing
    state.customSegments.forEach(s => s.autoCalc = false);
    state.customSegments.push({
      id: nextId,
      name: `Interval ${nextId}`,
      durationMin: 5,
      speedKmh: 13.0,
      paceStr: FitEngine.kmhToPaceStr(13.0),
      intensity: "Active",
      autoCalc: false
    });
    autoCalculateFinalSegment();
    renderSegmentsList();
    updateWorkoutPreview();
  }

  function addIntervalPair() {
    const nextId = (state.customSegments.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    state.customSegments.forEach(s => s.autoCalc = false);
    state.customSegments.push({
      id: nextId,
      name: `Interval`,
      durationMin: 5,
      speedKmh: 13.7,
      paceStr: FitEngine.kmhToPaceStr(13.7),
      intensity: "Active",
      autoCalc: false
    });
    state.customSegments.push({
      id: nextId + 1,
      name: `Recovery`,
      durationMin: 1.5,
      speedKmh: 5.7,
      paceStr: FitEngine.kmhToPaceStr(5.7),
      intensity: "Resting",
      autoCalc: false
    });
    autoCalculateFinalSegment();
    renderSegmentsList();
    updateWorkoutPreview();
  }

  // --- Progression Helper Modal ---
  function setupProgressionModal() {
    progressionBtn.addEventListener('click', () => progressionModal.classList.remove('hidden'));
    closeProgModalBtn.addEventListener('click', () => progressionModal.classList.add('hidden'));
    cancelProgBtn.addEventListener('click', () => progressionModal.classList.add('hidden'));

    progIncludeRec.addEventListener('change', () => {
      progRecDurGroup.style.display = progIncludeRec.value === 'yes' ? 'flex' : 'none';
    });

    applyProgBtn.addEventListener('click', () => {
      const startSpd = parseFloat(document.getElementById('prog-start-spd').value) || 11.0;
      const endSpd = parseFloat(document.getElementById('prog-end-spd').value) || 14.0;
      const stepSpd = parseFloat(document.getElementById('prog-step-spd').value) || 0.5;
      const stepDur = parseFloat(document.getElementById('prog-step-dur').value) || 3.0;
      const incRec = progIncludeRec.value === 'yes';
      const recDur = parseFloat(document.getElementById('prog-rec-dur').value) || 1.0;

      if (startSpd >= endSpd || stepSpd <= 0) {
        alert('Start speed must be less than End speed, and step increment > 0');
        return;
      }

      state.customSegments = [];
      let cur = startSpd;
      let stepIdx = 1;

      while (cur <= endSpd + 0.01) {
        state.customSegments.push({
          id: stepIdx,
          name: `Progression ${stepIdx} (${cur.toFixed(1)}k)`,
          durationMin: stepDur,
          speedKmh: parseFloat(cur.toFixed(1)),
          paceStr: FitEngine.kmhToPaceStr(cur),
          intensity: 'Active',
          autoCalc: false
        });
        stepIdx++;

        if (incRec && cur < endSpd - 0.01) {
          state.customSegments.push({
            id: stepIdx,
            name: `Recovery`,
            durationMin: recDur,
            speedKmh: 5.7,
            paceStr: FitEngine.kmhToPaceStr(5.7),
            intensity: 'Resting',
            autoCalc: false
          });
          stepIdx++;
        }
        cur += stepSpd;
      }

      // Add cool down with auto-calc
      state.customSegments.push({
        id: stepIdx,
        name: 'Cool Down',
        durationMin: 0,
        speedKmh: 10.6,
        paceStr: FitEngine.kmhToPaceStr(10.6),
        intensity: 'Active',
        autoCalc: true
      });

      progressionModal.classList.add('hidden');
      autoCalculateFinalSegment();
      renderSegmentsList();
      updateWorkoutPreview();
    });
  }

  // --- Live Timeline & Preview ---
  function updateWorkoutPreview() {
    let plan;
    if (state.workoutMode === 'custom_segments') {
      autoCalculateFinalSegment();
      plan = FitEngine.buildWorkoutPlan({
        mode: 'custom_segments',
        segments: state.customSegments,
        targetDistKm: parseFloat(segTargetDistIn.value) || 0,
        autoCalcFinal: true
      });
    } else {
      plan = FitEngine.buildWorkoutPlan({
        mode: 'repeats',
        warmupMin: wuDurIn.value,
        warmupKmh: wuKmhIn.value,
        repeats: repCountIn.value,
        intMin: intDurIn.value,
        intKmh: intKmhIn.value,
        recMin: recDurIn.value,
        recKmh: recKmhIn.value,
        cdKmh: cdKmhIn.value,
        cdMode: cdModeSelect.value,
        targetDistKm: targetDistIn.value,
        cdManualMin: cdManualDurIn.value
      });

      // Update warm up dist badge
      const wuDurSec = Math.round((parseFloat(wuDurIn.value) || 0) * 60);
      const wuSpdMs = FitEngine.kmhToMs(wuKmhIn.value || 0);
      wuDistEst.innerText = `${((wuDurSec * wuSpdMs) / 1000.0).toFixed(2)} km`;
    }

    const totalSec = plan.targetSpeeds.length;
    let totalDistM = 0;
    plan.targetSpeeds.forEach(s => totalDistM += s);

    const avgSpdMs = totalSec > 0 ? totalDistM / totalSec : 0;
    const avgSpdKmh = avgSpdMs * 3.6;

    prevDuration.innerText = FitEngine.formatDuration(totalSec);
    prevDistance.innerText = `${(totalDistM / 1000.0).toFixed(2)} km`;
    prevPace.innerText = FitEngine.kmhToPaceStr(avgSpdKmh);
    prevSpeed.innerText = `${avgSpdKmh.toFixed(1)} km/h`;

    // Render timeline bar
    timelineBar.innerHTML = '';
    plan.laps.forEach(lap => {
      const pct = totalSec > 0 ? (lap.duration / totalSec) * 100 : 0;
      const segEl = document.createElement('div');
      let typeClass = 'interval';
      if (lap.phase.toLowerCase().includes('warm')) typeClass = 'warmup';
      else if (lap.phase.toLowerCase().includes('rec')) typeClass = 'recovery';
      else if (lap.phase.toLowerCase().includes('cool')) typeClass = 'cooldown';

      segEl.className = `timeline-seg ${typeClass}`;
      segEl.style.width = `${pct}%`;
      segEl.title = `${lap.phase}: ${FitEngine.formatDuration(lap.duration)} @ ${lap.speed_kmh} km/h`;
      timelineBar.appendChild(segEl);
    });
  }

  // --- Device Selection ---
  function setupDeviceSelect() {
    deviceSelect.addEventListener('change', () => {
      devicePillText.innerText = deviceSelect.value;
    });
  }

  // --- Processing Action ---
  function setupActionButtons() {
    processBtn.addEventListener('click', runProcessor);
    iosShareBtn.addEventListener('click', shareWorkoutToIos);
    dlZipBtn.addEventListener('click', downloadAllZip);
    dlTcxBtn.addEventListener('click', () => downloadFile('tcxGps', 'New.tcx', 'application/vnd.garmin.tcx+xml'));
    dlFitGpsBtn.addEventListener('click', () => downloadFile('fitGps', 'New_gps.fit', 'application/octet-stream'));
    dlFitIndoorBtn.addEventListener('click', () => downloadFile('fitIndoor', 'New.fit', 'application/octet-stream'));
    dlTcxIndoorBtn.addEventListener('click', () => downloadFile('tcxIndoor', 'New_indoor.tcx', 'application/vnd.garmin.tcx+xml'));
    dlGpxBtn.addEventListener('click', () => downloadFile('gpx', 'New.gpx', 'application/gpx+xml'));
    dlCsvBtn.addEventListener('click', () => downloadFile('csv', 'New.csv', 'text/csv'));

    toggleLapsBtn.addEventListener('click', () => {
      const isHidden = lapsContainer.classList.contains('hidden');
      lapsContainer.classList.toggle('hidden', !isHidden);
      toggleLapsBtn.innerText = isHidden ? 'Hide Laps' : 'Show Laps';
    });
  }

  function runProcessor() {
    if (!state.aBuffer) {
      alert('Please upload or select an A.fit file first in Step 1.');
      return;
    }

    processBtn.disabled = true;
    processLoader.classList.remove('hidden');

    setTimeout(() => {
      try {
        const config = {
          mode: state.workoutMode,
          trimStationary: trimStationaryIn.checked,
          stationaryThreshold: 0.3,
          deviceType: deviceSelect.value,
          centerLat: 3.139000,
          centerLon: 101.686900
        };

        if (state.workoutMode === 'custom_segments') {
          autoCalculateFinalSegment();
          config.segments = state.customSegments;
          config.targetDistKm = parseFloat(segTargetDistIn.value) || 0;
          config.autoCalcFinal = true;
        } else {
          config.warmupMin = wuDurIn.value;
          config.warmupKmh = wuKmhIn.value;
          config.repeats = repCountIn.value;
          config.intMin = intDurIn.value;
          config.intKmh = intKmhIn.value;
          config.recMin = recDurIn.value;
          config.recKmh = recKmhIn.value;
          config.cdKmh = cdKmhIn.value;
          config.cdMode = cdModeSelect.value;
          config.targetDistKm = targetDistIn.value;
          config.cdManualMin = cdManualDurIn.value;
        }

        const res = FitEngine.processWorkout(state.aBuffer, config);

        // Build outputs
        const tcxGps = FitEngine.buildTCX(res, true);
        const tcxIndoor = FitEngine.buildTCX(res, false);
        const gpx = FitEngine.buildGPX(res);
        const csv = FitEngine.buildFitCSV(res, true);
        const fitIndoor = FitEngine.buildBinaryFIT(res, false);
        const fitGps = FitEngine.buildBinaryFIT(res, true);

        state.generatedOutputs = {
          res,
          tcxGps,
          tcxIndoor,
          gpx,
          csv,
          fitIndoor,
          fitGps
        };

        // Populate Results
        resTime.innerText = res.total_time_str;
        resDist.innerText = `${res.total_distance_km.toFixed(2)} km`;
        resPace.innerText = res.avg_pace_str;
        resMaxSpd.innerText = `${res.max_speed_kmh.toFixed(1)} km/h`;

        // Render Laps Table
        lapsTbody.innerHTML = '';
        res.laps.forEach(l => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${l.lap_index + 1}</td>
            <td style="text-align: left; font-weight: 500;">${l.phase}</td>
            <td>${l.duration_str}</td>
            <td>${l.pace_str}</td>
            <td>${(l.distance_m / 1000).toFixed(2)}k</td>
            <td>${l.avg_hr}</td>
            <td>${l.avg_cadence}</td>
          `;
          lapsTbody.appendChild(row);
        });

        resultsCard.classList.remove('hidden');
        resultsCard.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        alert(`Processing error: ${err.message}`);
      } finally {
        processBtn.disabled = false;
        processLoader.classList.add('hidden');
      }
    }, 50);
  }

  // --- iOS Share Sheet (Web Share API) ---
  async function shareWorkoutToIos() {
    if (!state.generatedOutputs) return;
    const { tcxGps, fitGps, res } = state.generatedOutputs;

    try {
      const tcxBlob = new Blob([tcxGps], { type: 'application/vnd.garmin.tcx+xml' });
      const tcxFile = new File([tcxBlob], 'New.tcx', { type: 'application/vnd.garmin.tcx+xml' });

      const fitBlob = new Blob([fitGps], { type: 'application/octet-stream' });
      const fitFile = new File([fitBlob], 'New_gps.fit', { type: 'application/octet-stream' });

      if (navigator.canShare && navigator.canShare({ files: [tcxFile] })) {
        await navigator.share({
          title: `Workout (${res.total_distance_km}km)`,
          text: `FitSync interval workout: ${res.total_time_str} • ${res.total_distance_km} km`,
          files: [tcxFile, fitFile]
        });
      } else {
        // Fallback to downloading New.tcx directly
        downloadFile('tcxGps', 'New.tcx', 'application/vnd.garmin.tcx+xml');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        downloadFile('tcxGps', 'New.tcx', 'application/vnd.garmin.tcx+xml');
      }
    }
  }

  // --- Downloads ---
  function downloadFile(key, fileName, mimeType) {
    if (!state.generatedOutputs) return;
    const data = state.generatedOutputs[key];
    if (!data) return;

    const blob = (data instanceof ArrayBuffer) ? new Blob([data], { type: mimeType }) : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  async function downloadAllZip() {
    if (!state.generatedOutputs) return;
    const { tcxGps, tcxIndoor, gpx, csv, fitIndoor, fitGps } = state.generatedOutputs;

    if (typeof JSZip === 'undefined') {
      downloadFile('tcxGps', 'New.tcx', 'application/vnd.garmin.tcx+xml');
      return;
    }

    const zip = new JSZip();
    zip.file('New.tcx', tcxGps);
    zip.file('New_indoor.tcx', tcxIndoor);
    zip.file('New.gpx', gpx);
    zip.file('New.csv', csv);
    zip.file('New.fit', fitIndoor);
    zip.file('New_gps.fit', fitGps);

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FitSync_Workout_Files.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // --- Profiles Manager (LocalStorage) ---
  const STORAGE_KEY = 'fitsync_mobile_profiles_v1';

  function setupProfilesManager() {
    loadProfilesFromStorage();

    saveProfileBtn.addEventListener('click', () => {
      const isSeg = (state.workoutMode === 'custom_segments');
      const dist = isSeg ? segTargetDistIn.value : targetDistIn.value;
      saveProfileTitle.value = isSeg ? `Manual Segments (${dist}km)` : `Repeats Run (${dist}km)`;
      saveProfileModal.classList.remove('hidden');
    });

    closeSaveModalBtn.addEventListener('click', () => saveProfileModal.classList.add('hidden'));
    cancelSaveModalBtn.addEventListener('click', () => saveProfileModal.classList.add('hidden'));

    confirmSaveProfileBtn.addEventListener('click', () => {
      const title = saveProfileTitle.value.trim() || 'My Workout';
      saveCurrentProfile(title);
      saveProfileModal.classList.add('hidden');
    });

    loadProfileBtn.addEventListener('click', loadSelectedProfile);
    deleteProfileBtn.addEventListener('click', deleteSelectedProfile);
    exportProfilesBtn.addEventListener('click', exportProfilesJson);
  }

  function getProfilesMap() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveProfilesMap(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  function loadProfilesFromStorage() {
    const map = getProfilesMap();
    savedProfilesSelect.innerHTML = '<option value="">-- Select Saved Profile --</option>';
    Object.keys(map).forEach(title => {
      const opt = document.createElement('option');
      opt.value = title;
      opt.innerText = title;
      savedProfilesSelect.appendChild(opt);
    });
  }

  function saveCurrentProfile(title) {
    const map = getProfilesMap();
    const isSeg = (state.workoutMode === 'custom_segments');

    if (isSeg) {
      map[title] = {
        title,
        mode: 'custom_segments',
        targetDistKm: parseFloat(segTargetDistIn.value) || 12.0,
        deviceType: deviceSelect.value,
        trimStationary: trimStationaryIn.checked,
        segments: state.customSegments
      };
    } else {
      map[title] = {
        title,
        mode: 'repeats',
        warmupMin: wuDurIn.value,
        warmupKmh: wuKmhIn.value,
        repeats: repCountIn.value,
        intMin: intDurIn.value,
        intKmh: intKmhIn.value,
        recMin: recDurIn.value,
        recKmh: recKmhIn.value,
        cdKmh: cdKmhIn.value,
        cdMode: cdModeSelect.value,
        targetDistKm: targetDistIn.value,
        cdManualMin: cdManualDurIn.value,
        deviceType: deviceSelect.value,
        trimStationary: trimStationaryIn.checked
      };
    }

    saveProfilesMap(map);
    loadProfilesFromStorage();
    savedProfilesSelect.value = title;
    alert(`Saved profile: "${title}"`);
  }

  function loadSelectedProfile() {
    const title = savedProfilesSelect.value;
    if (!title) return;
    const map = getProfilesMap();
    const p = map[title];
    if (!p) return;

    if (p.deviceType) deviceSelect.value = p.deviceType;
    if (p.trimStationary !== undefined) trimStationaryIn.checked = p.trimStationary;

    if (p.mode === 'custom_segments' || p.segments) {
      switchMode('custom_segments');
      segTargetDistIn.value = p.targetDistKm || 12.0;
      state.customSegments = p.segments || [];
      autoCalculateFinalSegment();
      renderSegmentsList();
    } else {
      switchMode('repeats');
      wuDurIn.value = p.warmupMin;
      wuKmhIn.value = p.warmupKmh;
      wuPaceIn.value = FitEngine.kmhToPaceStr(p.warmupKmh);
      repCountIn.value = p.repeats;
      intDurIn.value = p.intMin;
      intKmhIn.value = p.intKmh;
      intPaceIn.value = FitEngine.kmhToPaceStr(p.intKmh);
      recDurIn.value = p.recMin;
      recKmhIn.value = p.recKmh;
      recPaceIn.value = FitEngine.kmhToPaceStr(p.recKmh);
      cdKmhIn.value = p.cdKmh;
      cdPaceIn.value = FitEngine.kmhToPaceStr(p.cdKmh);
      targetDistIn.value = p.targetDistKm;
      cdModeSelect.value = p.cdMode || 'auto_distance';
      cdManualDurIn.value = p.cdManualMin || 12;
      cdManualGroup.classList.toggle('hidden', cdModeSelect.value !== 'manual');
    }

    updateWorkoutPreview();
  }

  function deleteSelectedProfile() {
    const title = savedProfilesSelect.value;
    if (!title) return;
    if (!confirm(`Delete profile "${title}"?`)) return;

    const map = getProfilesMap();
    delete map[title];
    saveProfilesMap(map);
    loadProfilesFromStorage();
  }

  function exportProfilesJson() {
    const map = getProfilesMap();
    const str = JSON.stringify(map, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitsync_profiles.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // --- Run Initialization ---
  document.addEventListener('DOMContentLoaded', init);
})();
