/**
 * FitSync Mobile - Application Logic
 * Optimized for Safari on iPhone 15 Pro Max & GitHub Pages
 * Handles file loading, pace syncing, segment editing, live timeline,
 * workout processing, iOS Share Sheet, and LocalStorage profiles.
 * Supports Duration (Min & Sec) and Distance calculation modes across all phases.
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
    repeatsCalcMode: 'duration', // 'duration' or 'distance'
    segCalcMode: 'duration', // 'duration' or 'distance'
    customSegments: [
      { id: 1, name: "Warm Up", min: 14, sec: 0, durationMin: 14.0, speedKmh: 10.6, paceStr: "5:40", distKm: 2.47, intensity: "Active", autoCalc: false },
      { id: 2, name: "Interval 1", min: 10, sec: 0, durationMin: 10.0, speedKmh: 13.7, paceStr: "4:23", distKm: 2.28, intensity: "Active", autoCalc: false },
      { id: 3, name: "Recovery 1", min: 2, sec: 0, durationMin: 2.0, speedKmh: 5.7, paceStr: "10:32", distKm: 0.19, intensity: "Resting", autoCalc: false },
      { id: 4, name: "Interval 2", min: 10, sec: 0, durationMin: 10.0, speedKmh: 13.7, paceStr: "4:23", distKm: 2.28, intensity: "Active", autoCalc: false },
      { id: 5, name: "Recovery 2", min: 2, sec: 0, durationMin: 2.0, speedKmh: 5.7, paceStr: "10:32", distKm: 0.19, intensity: "Resting", autoCalc: false },
      { id: 6, name: "Cool Down", min: 0, sec: 0, durationMin: 0.0, speedKmh: 10.6, paceStr: "5:40", distKm: 0.0, intensity: "Active", autoCalc: true }
    ],
    generatedOutputs: null
  };

  // --- Duration Helpers ---
  function parseMinSecToSec(min, sec) {
    const m = parseInt(min, 10) || 0;
    const s = parseInt(sec, 10) || 0;
    return Math.max(0, m * 60 + s);
  }

  function secToMinSec(totalSec) {
    const tot = Math.max(0, Math.round(totalSec));
    return {
      min: Math.floor(tot / 60),
      sec: tot % 60
    };
  }

  // --- Presets ---
  const PRESETS = [
    {
      name: '3×10m @ 13.7 (12km)',
      wuMin: 14, wuSec: 0, wuKmh: 10.6,
      repeats: 3, intMin: 10, intSec: 0, intKmh: 13.7, recMin: 2, recSec: 0, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 12.0
    },
    {
      name: '5×3m @ 14.2 (8.4km)',
      wuMin: 13, wuSec: 0, wuKmh: 10.6,
      repeats: 5, intMin: 3, intSec: 0, intKmh: 14.2, recMin: 1, recSec: 0, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 8.44
    },
    {
      name: '3×5m @ 13.7 (8.4km)',
      wuMin: 14, wuSec: 0, wuKmh: 10.6,
      repeats: 3, intMin: 5, intSec: 0, intKmh: 13.7, recMin: 1, recSec: 20, recKmh: 5.7,
      cdKmh: 10.6, targetDistKm: 8.42
    },
    {
      name: '5×6m @ 14.2 (12.1km)',
      wuMin: 13, wuSec: 0, wuKmh: 10.6,
      repeats: 5, intMin: 6, intSec: 0, intKmh: 14.2, recMin: 1, recSec: 30, recKmh: 5.7,
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
  const pillRepeatsDur = document.getElementById('pill-repeats-dur');
  const pillRepeatsDist = document.getElementById('pill-repeats-dist');

  const wuMinIn = document.getElementById('wu-min');
  const wuSecIn = document.getElementById('wu-sec');
  const wuDistIn = document.getElementById('wu-dist');
  const wuDurIn = document.getElementById('wu-dur');
  const wuKmhIn = document.getElementById('wu-kmh');
  const wuPaceIn = document.getElementById('wu-pace');
  const wuDistEst = document.getElementById('wu-dist-est');

  const repCountIn = document.getElementById('rep-count');

  const intMinIn = document.getElementById('int-min');
  const intSecIn = document.getElementById('int-sec');
  const intDistIn = document.getElementById('int-dist');
  const intDurIn = document.getElementById('int-dur');
  const intKmhIn = document.getElementById('int-kmh');
  const intPaceIn = document.getElementById('int-pace');

  const recMinIn = document.getElementById('rec-min');
  const recSecIn = document.getElementById('rec-sec');
  const recDistIn = document.getElementById('rec-dist');
  const recDurIn = document.getElementById('rec-dur');
  const recKmhIn = document.getElementById('rec-kmh');
  const recPaceIn = document.getElementById('rec-pace');

  const cdKmhIn = document.getElementById('cd-kmh');
  const cdPaceIn = document.getElementById('cd-pace');
  const targetDistIn = document.getElementById('target-dist');
  const cdModeSelect = document.getElementById('cd-mode-select');
  const cdManualGroup = document.getElementById('cd-manual-group');
  const cdManualMinIn = document.getElementById('cd-manual-min');
  const cdManualSecIn = document.getElementById('cd-manual-sec');
  const cdManualDistIn = document.getElementById('cd-manual-dist');
  const cdManualDurIn = document.getElementById('cd-manual-dur');

  // Segments Inputs
  const segTargetDistIn = document.getElementById('seg-target-dist');
  const segCalcModeSelect = document.getElementById('seg-calc-mode');
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
    setupStepTimeAndDistBindings();
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

        const durSec = p.duration_sec || Math.round((p.duration_min || 0) * 60);
        const ms = secToMinSec(durSec);
        const dist = parseFloat(((durSec * p.speed_ms) / 1000.0).toFixed(2));

        return {
          id: idx + 1,
          name: name,
          min: ms.min,
          sec: ms.sec,
          durationMin: p.duration_min,
          distKm: dist,
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
      const wuSec = wu.duration_sec || Math.round((wu.duration_min || 0) * 60);
      const wuMs = secToMinSec(wuSec);
      wuMinIn.value = wuMs.min;
      wuSecIn.value = wuMs.sec;
      wuDurIn.value = (wuSec / 60.0).toFixed(2);
      wuKmhIn.value = wu.speed_kmh;
      wuPaceIn.value = FitEngine.kmhToPaceStr(wu.speed_kmh);
      wuDistIn.value = ((wuSec * wu.speed_kmh) / 3600.0).toFixed(2);

      if (phases.length >= 3) {
        const intP = phases[1];
        const recP = phases[2];
        const intSec = intP.duration_sec || Math.round((intP.duration_min || 0) * 60);
        const intMs = secToMinSec(intSec);
        intMinIn.value = intMs.min;
        intSecIn.value = intMs.sec;
        intDurIn.value = (intSec / 60.0).toFixed(2);
        intKmhIn.value = intP.speed_kmh;
        intPaceIn.value = FitEngine.kmhToPaceStr(intP.speed_kmh);
        intDistIn.value = ((intSec * intP.speed_kmh) / 3600.0).toFixed(2);

        const recSec = recP.duration_sec || Math.round((recP.duration_min || 0) * 60);
        const recMs = secToMinSec(recSec);
        recMinIn.value = recMs.min;
        recSecIn.value = recMs.sec;
        recDurIn.value = (recSec / 60.0).toFixed(2);
        recKmhIn.value = recP.speed_kmh;
        recPaceIn.value = FitEngine.kmhToPaceStr(recP.speed_kmh);
        recDistIn.value = ((recSec * recP.speed_kmh) / 3600.0).toFixed(2);

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
          kmhIn.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  function setupDualPaceBindings() {
    bindPacePair(wuKmhIn, wuPaceIn);
    bindPacePair(intKmhIn, intPaceIn);
    bindPacePair(recKmhIn, recPaceIn);
    bindPacePair(cdKmhIn, cdPaceIn);

    targetDistIn.addEventListener('input', updateWorkoutPreview);
    repCountIn.addEventListener('input', updateWorkoutPreview);

    cdModeSelect.addEventListener('change', () => {
      const isManual = cdModeSelect.value === 'manual';
      cdManualGroup.classList.toggle('hidden', !isManual);
      updateWorkoutPreview();
    });
  }

  // --- Live Two-Way Time (Min & Sec) <-> Distance Bindings for Repeats ---
  function bindStepTimeAndDist(minEl, secEl, distEl, durHiddenEl, kmhEl, getCalcMode) {
    if (!minEl || !secEl || !distEl || !kmhEl) return;

    function updateDistFromTime() {
      const totalSec = parseMinSecToSec(minEl.value, secEl.value);
      if (durHiddenEl) durHiddenEl.value = (totalSec / 60.0).toFixed(2);
      const kmh = parseFloat(kmhEl.value) || 0;
      if (kmh > 0) {
        const dist = (totalSec * kmh) / 3600.0;
        distEl.value = dist.toFixed(2);
      }
      updateWorkoutPreview();
    }

    function updateTimeFromDist() {
      const dist = parseFloat(distEl.value) || 0;
      const kmh = parseFloat(kmhEl.value) || 0;
      if (kmh > 0 && dist > 0) {
        const totalSec = Math.round((dist * 3600.0) / kmh);
        const ms = secToMinSec(totalSec);
        minEl.value = ms.min;
        secEl.value = ms.sec;
        if (durHiddenEl) durHiddenEl.value = (totalSec / 60.0).toFixed(2);
      }
      updateWorkoutPreview();
    }

    minEl.addEventListener('input', updateDistFromTime);
    secEl.addEventListener('input', updateDistFromTime);
    distEl.addEventListener('input', updateTimeFromDist);

    kmhEl.addEventListener('input', () => {
      const mode = getCalcMode ? getCalcMode() : 'duration';
      if (mode === 'distance') {
        updateTimeFromDist();
      } else {
        updateDistFromTime();
      }
    });
  }

  function setupStepTimeAndDistBindings() {
    bindStepTimeAndDist(wuMinIn, wuSecIn, wuDistIn, wuDurIn, wuKmhIn, () => state.repeatsCalcMode);
    bindStepTimeAndDist(intMinIn, intSecIn, intDistIn, intDurIn, intKmhIn, () => state.repeatsCalcMode);
    bindStepTimeAndDist(recMinIn, recSecIn, recDistIn, recDurIn, recKmhIn, () => state.repeatsCalcMode);
    bindStepTimeAndDist(cdManualMinIn, cdManualSecIn, cdManualDistIn, cdManualDurIn, cdKmhIn, () => state.repeatsCalcMode);

    // Repeats Calculation Mode Pills
    const radioCalcModes = document.querySelectorAll('input[name="repeats-calc-mode"]');
    radioCalcModes.forEach(r => {
      r.addEventListener('change', (e) => {
        state.repeatsCalcMode = e.target.value;
        pillRepeatsDur?.classList.toggle('active', state.repeatsCalcMode === 'duration');
        pillRepeatsDist?.classList.toggle('active', state.repeatsCalcMode === 'distance');
        updateWorkoutPreview();
      });
    });

    // Custom Segments Mode Select
    segCalcModeSelect?.addEventListener('change', (e) => {
      state.segCalcMode = e.target.value;
      autoCalculateFinalSegment();
      renderSegmentsList();
      updateWorkoutPreview();
    });
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

    const wuMin = p.wuMin !== undefined ? p.wuMin : 14;
    const wuSec = p.wuSec !== undefined ? p.wuSec : 0;
    const wuTotSec = wuMin * 60 + wuSec;
    wuMinIn.value = wuMin;
    wuSecIn.value = wuSec;
    wuDurIn.value = (wuTotSec / 60.0).toFixed(2);
    wuKmhIn.value = p.wuKmh;
    wuPaceIn.value = FitEngine.kmhToPaceStr(p.wuKmh);
    wuDistIn.value = ((wuTotSec * p.wuKmh) / 3600.0).toFixed(2);

    repCountIn.value = p.repeats;

    const intMin = p.intMin !== undefined ? p.intMin : 10;
    const intSec = p.intSec !== undefined ? p.intSec : 0;
    const intTotSec = intMin * 60 + intSec;
    intMinIn.value = intMin;
    intSecIn.value = intSec;
    intDurIn.value = (intTotSec / 60.0).toFixed(2);
    intKmhIn.value = p.intKmh;
    intPaceIn.value = FitEngine.kmhToPaceStr(p.intKmh);
    intDistIn.value = ((intTotSec * p.intKmh) / 3600.0).toFixed(2);

    const recMin = p.recMin !== undefined ? p.recMin : 2;
    const recSec = p.recSec !== undefined ? p.recSec : 0;
    const recTotSec = recMin * 60 + recSec;
    recMinIn.value = recMin;
    recSecIn.value = recSec;
    recDurIn.value = (recTotSec / 60.0).toFixed(2);
    recKmhIn.value = p.recKmh;
    recPaceIn.value = FitEngine.kmhToPaceStr(p.recKmh);
    recDistIn.value = ((recTotSec * p.recKmh) / 3600.0).toFixed(2);

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
      const durSec = (parseInt(s.min, 10) || 0) * 60 + (parseInt(s.sec, 10) || 0);
      const spdMs = FitEngine.kmhToMs(s.speedKmh || 0);
      const dM = durSec * spdMs;
      s.distKm = parseFloat((dM / 1000.0).toFixed(2));
      priorDistM += dM;
    }

    const lastIdx = num - 1;
    const lastSeg = state.customSegments[lastIdx];

    bannerTarget.innerText = `${targetDistKm.toFixed(2)} km`;
    bannerPrior.innerText = `${(priorDistM / 1000.0).toFixed(2)} km`;

    if (lastSeg && lastSeg.autoCalc) {
      const remDistM = Math.max(0, targetDistM - priorDistM);
      bannerRemaining.innerText = `${(remDistM / 1000.0).toFixed(2)} km`;
      lastSeg.distKm = parseFloat((remDistM / 1000.0).toFixed(2));

      const spdMs = FitEngine.kmhToMs(lastSeg.speedKmh || 0);
      if (spdMs > 0 && targetDistM > priorDistM) {
        const durSec = Math.round(remDistM / spdMs);
        const ms = secToMinSec(durSec);
        lastSeg.min = ms.min;
        lastSeg.sec = ms.sec;
        lastSeg.durationMin = parseFloat((durSec / 60.0).toFixed(2));
      } else {
        lastSeg.min = 0;
        lastSeg.sec = 0;
        lastSeg.durationMin = 0;
      }
    } else {
      if (lastSeg) {
        const durSec = (parseInt(lastSeg.min, 10) || 0) * 60 + (parseInt(lastSeg.sec, 10) || 0);
        const lastDist = durSec * FitEngine.kmhToMs(lastSeg.speedKmh || 0);
        lastSeg.distKm = parseFloat((lastDist / 1000.0).toFixed(2));
        bannerRemaining.innerText = `${lastSeg.distKm.toFixed(2)} km`;
      }
    }
  }

  function renderSegmentsList() {
    segmentsList.innerHTML = '';
    const num = state.customSegments.length;

    state.customSegments.forEach((seg, idx) => {
      const isFinal = (idx === num - 1);
      if (seg.min === undefined || seg.sec === undefined) {
        const ms = secToMinSec(Math.round((seg.durationMin || 0) * 60));
        seg.min = ms.min;
        seg.sec = ms.sec;
      }
      const durSec = (parseInt(seg.min, 10) || 0) * 60 + (parseInt(seg.sec, 10) || 0);
      const spdMs = FitEngine.kmhToMs(seg.speedKmh || 0);
      if (seg.distKm === undefined) {
        seg.distKm = parseFloat(((durSec * spdMs) / 1000.0).toFixed(2));
      }

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
            <label>Speed (km/h)</label>
            <input type="number" class="seg-kmh-in" value="${seg.speedKmh || 0}" step="0.1" inputmode="decimal">
          </div>
          <div class="input-group">
            <label>Pace (min/km)</label>
            <input type="text" class="seg-pace-in" value="${seg.paceStr || FitEngine.kmhToPaceStr(seg.speedKmh)}" placeholder="4:30">
          </div>
          <div class="input-group">
            <label>Duration</label>
            <div class="minsec-inputs">
              <input type="number" class="seg-min-in" value="${seg.min}" min="0" placeholder="min" inputmode="numeric" style="width: 38px;" ${seg.autoCalc ? 'disabled' : ''}>
              <span>m</span>
              <input type="number" class="seg-sec-in" value="${seg.sec}" min="0" max="59" placeholder="sec" inputmode="numeric" style="width: 38px;" ${seg.autoCalc ? 'disabled' : ''}>
              <span>s</span>
            </div>
          </div>
          <div class="input-group">
            <label>Dist (km)</label>
            <input type="number" class="seg-dist-in" value="${seg.distKm}" step="0.01" min="0" inputmode="decimal" style="width: 60px;" ${seg.autoCalc ? 'disabled' : ''}>
          </div>
        </div>
        <div class="seg-bottom-row">
          <div style="display: flex; gap: 8px; align-items: center;">
            <select class="seg-int-in" style="height: 28px; font-size: 11px; padding: 0 4px; width: 80px;">
              <option value="Active" ${seg.intensity === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Resting" ${seg.intensity === 'Resting' ? 'selected' : ''}>Resting</option>
            </select>
            <span class="seg-dist-text">${seg.distKm} km</span>
          </div>
          ${isFinal ? `
          <label style="display: flex; align-items: center; gap: 4px; color: var(--accent-purple); cursor: pointer; font-size: 12px;">
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
      const minIn = card.querySelector('.seg-min-in');
      const secIn = card.querySelector('.seg-sec-in');
      const distIn = card.querySelector('.seg-dist-in');
      const intIn = card.querySelector('.seg-int-in');
      const delBtn = card.querySelector('.seg-del-btn');
      const autoToggle = card.querySelector('.seg-autocalc-toggle');

      nameIn.addEventListener('input', (e) => {
        seg.name = e.target.value;
        updateWorkoutPreview();
      });

      function onSpeedChange(newKmh) {
        seg.speedKmh = newKmh;
        seg.paceStr = FitEngine.kmhToPaceStr(newKmh);
        paceIn.value = seg.paceStr;

        if (state.segCalcMode === 'distance') {
          if (newKmh > 0 && (seg.distKm || 0) > 0) {
            const tSec = Math.round((seg.distKm * 3600.0) / newKmh);
            const ms = secToMinSec(tSec);
            seg.min = ms.min;
            seg.sec = ms.sec;
            seg.durationMin = parseFloat((tSec / 60.0).toFixed(2));
            minIn.value = ms.min;
            secIn.value = ms.sec;
          }
        } else {
          const tSec = (parseInt(seg.min, 10) || 0) * 60 + (parseInt(seg.sec, 10) || 0);
          seg.distKm = parseFloat(((tSec * newKmh) / 3600.0).toFixed(2));
          distIn.value = seg.distKm;
        }
        autoCalculateFinalSegment();
        updateWorkoutPreview();
      }

      kmhIn.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        onSpeedChange(val);
      });

      paceIn.addEventListener('input', (e) => {
        const str = e.target.value.trim();
        if (str.length >= 3) {
          const kmh = FitEngine.paceStrToKmh(str);
          if (kmh > 0) {
            kmhIn.value = kmh;
            onSpeedChange(kmh);
          }
        }
      });

      function onTimeChange() {
        seg.min = parseInt(minIn.value, 10) || 0;
        seg.sec = parseInt(secIn.value, 10) || 0;
        const tSec = seg.min * 60 + seg.sec;
        seg.durationMin = parseFloat((tSec / 60.0).toFixed(2));
        const spd = seg.speedKmh || 0;
        if (spd > 0) {
          seg.distKm = parseFloat(((tSec * spd) / 3600.0).toFixed(2));
          distIn.value = seg.distKm;
        }
        autoCalculateFinalSegment();
        updateWorkoutPreview();
      }

      minIn.addEventListener('input', onTimeChange);
      secIn.addEventListener('input', onTimeChange);

      distIn.addEventListener('input', (e) => {
        seg.distKm = parseFloat(e.target.value) || 0;
        const spd = seg.speedKmh || 0;
        if (spd > 0 && seg.distKm > 0) {
          const tSec = Math.round((seg.distKm * 3600.0) / spd);
          const ms = secToMinSec(tSec);
          seg.min = ms.min;
          seg.sec = ms.sec;
          seg.durationMin = parseFloat((tSec / 60.0).toFixed(2));
          minIn.value = ms.min;
          secIn.value = ms.sec;
        }
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
    const spd = 13.0;
    const durSec = 5 * 60;
    const dist = parseFloat(((durSec * spd) / 3600.0).toFixed(2));
    state.customSegments.push({
      id: nextId,
      name: `Interval ${nextId}`,
      min: 5,
      sec: 0,
      durationMin: 5,
      distKm: dist,
      speedKmh: spd,
      paceStr: FitEngine.kmhToPaceStr(spd),
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
    const intDist = parseFloat(((5 * 60 * 13.7) / 3600.0).toFixed(2));
    state.customSegments.push({
      id: nextId,
      name: `Interval`,
      min: 5,
      sec: 0,
      durationMin: 5,
      distKm: intDist,
      speedKmh: 13.7,
      paceStr: FitEngine.kmhToPaceStr(13.7),
      intensity: "Active",
      autoCalc: false
    });
    const recDist = parseFloat(((90 * 5.7) / 3600.0).toFixed(2));
    state.customSegments.push({
      id: nextId + 1,
      name: `Recovery`,
      min: 1,
      sec: 30,
      durationMin: 1.5,
      distKm: recDist,
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

      const durSec = Math.round(stepDur * 60);
      const durMs = secToMinSec(durSec);

      const recSec = Math.round(recDur * 60);
      const recMs = secToMinSec(recSec);

      while (cur <= endSpd + 0.01) {
        const curSpd = parseFloat(cur.toFixed(1));
        const dist = parseFloat(((durSec * curSpd) / 3600.0).toFixed(2));
        state.customSegments.push({
          id: stepIdx,
          name: `Progression ${stepIdx} (${curSpd}k)`,
          min: durMs.min,
          sec: durMs.sec,
          durationMin: stepDur,
          distKm: dist,
          speedKmh: curSpd,
          paceStr: FitEngine.kmhToPaceStr(curSpd),
          intensity: 'Active',
          autoCalc: false
        });
        stepIdx++;

        if (incRec && cur < endSpd - 0.01) {
          const rDist = parseFloat(((recSec * 5.7) / 3600.0).toFixed(2));
          state.customSegments.push({
            id: stepIdx,
            name: `Recovery`,
            min: recMs.min,
            sec: recMs.sec,
            durationMin: recDur,
            distKm: rDist,
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
        min: 0,
        sec: 0,
        durationMin: 0,
        distKm: 0,
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
        calcMode: state.segCalcMode,
        segments: state.customSegments,
        targetDistKm: parseFloat(segTargetDistIn.value) || 0,
        autoCalcFinal: true
      });
    } else {
      plan = FitEngine.buildWorkoutPlan({
        mode: 'repeats',
        calcMode: state.repeatsCalcMode,
        warmupMin: wuMinIn.value,
        warmupSec: wuSecIn.value,
        warmupDistKm: wuDistIn.value,
        warmupKmh: wuKmhIn.value,
        repeats: repCountIn.value,
        intMin: intMinIn.value,
        intSec: intSecIn.value,
        intDistKm: intDistIn.value,
        intKmh: intKmhIn.value,
        recMin: recMinIn.value,
        recSec: recSecIn.value,
        recDistKm: recDistIn.value,
        recKmh: recKmhIn.value,
        cdKmh: cdKmhIn.value,
        cdMode: cdModeSelect.value,
        targetDistKm: targetDistIn.value,
        cdManualMin: cdManualMinIn.value,
        cdManualSec: cdManualSecIn.value,
        cdManualDistKm: cdManualDistIn.value
      });

      // Update warm up dist badge
      const wuSec = parseMinSecToSec(wuMinIn.value, wuSecIn.value);
      const wuSpdMs = FitEngine.kmhToMs(wuKmhIn.value || 0);
      wuDistEst.innerText = `${((wuSec * wuSpdMs) / 1000.0).toFixed(2)} km`;
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
          config.calcMode = state.segCalcMode;
          config.segments = state.customSegments;
          config.targetDistKm = parseFloat(segTargetDistIn.value) || 0;
          config.autoCalcFinal = true;
        } else {
          config.calcMode = state.repeatsCalcMode;
          config.warmupMin = wuMinIn.value;
          config.warmupSec = wuSecIn.value;
          config.warmupDistKm = wuDistIn.value;
          config.warmupKmh = wuKmhIn.value;

          config.repeats = repCountIn.value;

          config.intMin = intMinIn.value;
          config.intSec = intSecIn.value;
          config.intDistKm = intDistIn.value;
          config.intKmh = intKmhIn.value;

          config.recMin = recMinIn.value;
          config.recSec = recSecIn.value;
          config.recDistKm = recDistIn.value;
          config.recKmh = recKmhIn.value;

          config.cdKmh = cdKmhIn.value;
          config.cdMode = cdModeSelect.value;
          config.targetDistKm = targetDistIn.value;

          config.cdManualMin = cdManualMinIn.value;
          config.cdManualSec = cdManualSecIn.value;
          config.cdManualDistKm = cdManualDistIn.value;
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
        calcMode: state.segCalcMode,
        targetDistKm: parseFloat(segTargetDistIn.value) || 12.0,
        deviceType: deviceSelect.value,
        trimStationary: trimStationaryIn.checked,
        segments: state.customSegments
      };
    } else {
      map[title] = {
        title,
        mode: 'repeats',
        calcMode: state.repeatsCalcMode,
        warmupMin: wuMinIn.value,
        warmupSec: wuSecIn.value,
        warmupDistKm: wuDistIn.value,
        warmupKmh: wuKmhIn.value,
        repeats: repCountIn.value,
        intMin: intMinIn.value,
        intSec: intSecIn.value,
        intDistKm: intDistIn.value,
        intKmh: intKmhIn.value,
        recMin: recMinIn.value,
        recSec: recSecIn.value,
        recDistKm: recDistIn.value,
        recKmh: recKmhIn.value,
        cdKmh: cdKmhIn.value,
        cdMode: cdModeSelect.value,
        targetDistKm: targetDistIn.value,
        cdManualMin: cdManualMinIn.value,
        cdManualSec: cdManualSecIn.value,
        cdManualDistKm: cdManualDistIn.value,
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
      if (p.calcMode) {
        state.segCalcMode = p.calcMode;
        if (segCalcModeSelect) segCalcModeSelect.value = p.calcMode;
      }
      state.customSegments = (p.segments || []).map((s, idx) => {
        const durMin = s.durationMin !== undefined ? s.durationMin : (s.duration || 0);
        const totSec = (s.min !== undefined && s.sec !== undefined) ? (parseInt(s.min, 10) * 60 + parseInt(s.sec, 10)) : Math.round(durMin * 60);
        const ms = secToMinSec(totSec);
        const spd = s.speedKmh !== undefined ? s.speedKmh : 10.0;
        const dist = s.distKm !== undefined ? s.distKm : parseFloat(((totSec * spd) / 3600.0).toFixed(2));
        return {
          id: s.id || (idx + 1),
          name: s.name || `Segment ${idx + 1}`,
          min: ms.min,
          sec: ms.sec,
          durationMin: parseFloat((totSec / 60.0).toFixed(2)),
          distKm: dist,
          speedKmh: spd,
          paceStr: s.paceStr || FitEngine.kmhToPaceStr(spd),
          intensity: s.intensity || 'Active',
          autoCalc: s.autoCalc !== undefined ? s.autoCalc : (idx === p.segments.length - 1)
        };
      });
      autoCalculateFinalSegment();
      renderSegmentsList();
    } else {
      switchMode('repeats');
      if (p.calcMode) {
        state.repeatsCalcMode = p.calcMode;
        const rad = document.querySelector(`input[name="repeats-calc-mode"][value="${p.calcMode}"]`);
        if (rad) rad.checked = true;
        pillRepeatsDur?.classList.toggle('active', p.calcMode === 'duration');
        pillRepeatsDist?.classList.toggle('active', p.calcMode === 'distance');
      }

      const wuSec = (p.warmupMin !== undefined && p.warmupSec !== undefined) ? (parseInt(p.warmupMin, 10) * 60 + parseInt(p.warmupSec, 10)) : Math.round((parseFloat(p.warmupMin) || 14) * 60);
      const wuMs = secToMinSec(wuSec);
      wuMinIn.value = wuMs.min;
      wuSecIn.value = wuMs.sec;
      wuDurIn.value = (wuSec / 60.0).toFixed(2);
      wuKmhIn.value = p.warmupKmh || 10.6;
      wuPaceIn.value = FitEngine.kmhToPaceStr(p.warmupKmh || 10.6);
      wuDistIn.value = p.warmupDistKm !== undefined ? p.warmupDistKm : ((wuSec * (p.warmupKmh || 10.6)) / 3600.0).toFixed(2);

      repCountIn.value = p.repeats || 3;

      const intSec = (p.intMin !== undefined && p.intSec !== undefined) ? (parseInt(p.intMin, 10) * 60 + parseInt(p.intSec, 10)) : Math.round((parseFloat(p.intMin) || 10) * 60);
      const intMs = secToMinSec(intSec);
      intMinIn.value = intMs.min;
      intSecIn.value = intMs.sec;
      intDurIn.value = (intSec / 60.0).toFixed(2);
      intKmhIn.value = p.intKmh || 13.7;
      intPaceIn.value = FitEngine.kmhToPaceStr(p.intKmh || 13.7);
      intDistIn.value = p.intDistKm !== undefined ? p.intDistKm : ((intSec * (p.intKmh || 13.7)) / 3600.0).toFixed(2);

      const recSec = (p.recMin !== undefined && p.recSec !== undefined) ? (parseInt(p.recMin, 10) * 60 + parseInt(p.recSec, 10)) : Math.round((parseFloat(p.recMin) || 2) * 60);
      const recMs = secToMinSec(recSec);
      recMinIn.value = recMs.min;
      recSecIn.value = recMs.sec;
      recDurIn.value = (recSec / 60.0).toFixed(2);
      recKmhIn.value = p.recKmh || 5.7;
      recPaceIn.value = FitEngine.kmhToPaceStr(p.recKmh || 5.7);
      recDistIn.value = p.recDistKm !== undefined ? p.recDistKm : ((recSec * (p.recKmh || 5.7)) / 3600.0).toFixed(2);

      cdKmhIn.value = p.cdKmh || 10.6;
      cdPaceIn.value = FitEngine.kmhToPaceStr(p.cdKmh || 10.6);
      targetDistIn.value = p.targetDistKm || 12.0;
      cdModeSelect.value = p.cdMode || 'auto_distance';

      const cdSec = (p.cdManualMin !== undefined && p.cdManualSec !== undefined) ? (parseInt(p.cdManualMin, 10) * 60 + parseInt(p.cdManualSec, 10)) : Math.round((parseFloat(p.cdManualMin) || 12) * 60);
      const cdMs = secToMinSec(cdSec);
      cdManualMinIn.value = cdMs.min;
      cdManualSecIn.value = cdMs.sec;
      cdManualDurIn.value = (cdSec / 60.0).toFixed(2);
      cdManualDistIn.value = p.cdManualDistKm !== undefined ? p.cdManualDistKm : ((cdSec * (p.cdKmh || 10.6)) / 3600.0).toFixed(2);
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
