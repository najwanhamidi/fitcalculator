/**
 * FitSync Mobile - High-Performance Client-Side FIT Engine
 * 100% Pure Client-Side JavaScript Engine for Garmin / Amazfit FIT files.
 * Works entirely in Safari on iPhone 15 Pro Max & desktop browsers with ZERO server dependencies.
 * 
 * Features:
 * - Binary FIT Protocol 2.0 Decoder (reads records, heart rate, cadence, speed, distance)
 * - Contiguous leading stationary records trimmer (< 0.3 m/s)
 * - Workout plan synthesizer (Structured Repeats & Manual Segments / Progression)
 * - Target distance auto-calculation for final segment
 * - Olympic 400m Stadium GPS Track Coordinate Synthesizer
 * - Exporters:
 *   - New.tcx (Zepp / Strava / Garmin Connect format with laps, GPS trackpoints & telemetry)
 *   - New_indoor.tcx (Clean treadmill TCX without GPS coordinates)
 *   - New.gpx (Standard GPX 1.1 with TrackPointExtension)
 *   - New.csv (FitCSVTool compatible CSV)
 *   - New.fit & New_gps.fit (Binary FIT format with 14-byte header and Garmin CRC-16)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FitEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // --- Constants ---
  const FIT_EPOCH_OFFSET = 631065600; // Seconds between 1970-01-01 and 1989-12-31

  // Garmin FIT CRC-16 lookup table
  const CRC_TABLE = [
    0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400
  ];

  function updateCrc(crc, byte) {
    let tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];

    tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
    return crc;
  }

  function computeCrc(uint8Array, start = 0, end = uint8Array.length) {
    let crc = 0;
    for (let i = start; i < end; i++) {
      crc = updateCrc(crc, uint8Array[i]);
    }
    return crc;
  }

  // --- Date & Time Helpers ---
  function fitTsToIso(fitTs) {
    const unixMs = (parseInt(fitTs, 10) + FIT_EPOCH_OFFSET) * 1000;
    return new Date(unixMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function formatDuration(sec) {
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}:${remS.toString().padStart(2, '0')}`;
  }

  // --- Pace & Speed Helpers ---
  function kmhToMs(kmh) {
    return (parseFloat(kmh) || 0) / 3.6;
  }

  function msToKmh(ms) {
    return parseFloat(((parseFloat(ms) || 0) * 3.6).toFixed(2));
  }

  function kmhToPaceStr(kmh) {
    const k = parseFloat(kmh);
    if (!k || k <= 0.1) return '--:--';
    const secPerKm = 3600.0 / k;
    let mins = Math.floor(secPerKm / 60);
    let secs = Math.round(secPerKm % 60);
    if (secs === 60) {
      mins += 1;
      secs = 0;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function paceStrToKmh(paceStr) {
    if (!paceStr) return 0;
    const clean = paceStr.replace(/[^0-9.:]/g, '').trim();
    if (clean.includes(':')) {
      const parts = clean.split(':');
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseFloat(parts[1]) || 0;
      const totalSec = mins * 60 + secs;
      if (totalSec <= 0) return 0;
      return parseFloat((3600.0 / totalSec).toFixed(2));
    }
    const val = parseFloat(clean);
    if (val > 0 && val < 30) {
      const totalSec = val * 60;
      return parseFloat((3600.0 / totalSec).toFixed(2));
    }
    return 0;
  }

  // --- 400m Olympic Track Coordinate Synthesizer ---
  function getTrackCoords(distM, centerLat = 3.139000, centerLon = 101.686900) {
    const L_s = 84.39;
    const R = (400.0 - 2.0 * L_s) / (2.0 * Math.PI); // ~36.7997 m
    const arc = Math.PI * R; // ~115.61 m
    const s = ((distM % 400.0) + 400.0) % 400.0;

    let x, y;
    if (s < L_s) {
      x = R;
      y = -L_s / 2.0 + s;
    } else if (s < L_s + arc) {
      const phi = ((s - L_s) / arc) * Math.PI;
      x = R * Math.cos(phi);
      y = L_s / 2.0 + R * Math.sin(phi);
    } else if (s < 2.0 * L_s + arc) {
      x = -R;
      y = L_s / 2.0 - (s - L_s - arc);
    } else {
      const phi = ((s - 2.0 * L_s - arc) / arc) * Math.PI;
      x = -R * Math.cos(phi);
      y = -L_s / 2.0 - R * Math.sin(phi);
    }

    const lat = centerLat + (y / 111320.0);
    const lon = centerLon + (x / (111320.0 * Math.cos(centerLat * Math.PI / 180.0)));
    return {
      lat: parseFloat(lat.toFixed(7)),
      lon: parseFloat(lon.toFixed(7)),
      semilat: Math.round(lat * (2147483648 / 180.0)),
      semilon: Math.round(lon * (2147483648 / 180.0))
    };
  }

  // --- Binary FIT Decoder ---
  function decodeFitBinary(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    if (uint8.length < 14) {
      throw new Error('FIT file too short (minimum 14 bytes header)');
    }

    const headerSize = view.getUint8(0);
    const protoVer = view.getUint8(1);
    const profVer = view.getUint16(2, true);
    const dataSize = view.getUint32(4, true);
    const tag = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));

    if (tag !== '.FIT') {
      throw new Error(`Invalid FIT file signature: "${tag}" (expected ".FIT")`);
    }

    const defs = {};
    const records = [];
    const laps = [];
    let session = null;
    let fileId = null;
    let deviceInfo = null;
    let lastTimestamp = 0;

    let pos = headerSize;
    const endPos = Math.min(uint8.length - 2, headerSize + dataSize);

    while (pos < endPos) {
      const rh = view.getUint8(pos++);

      if ((rh & 0x80) !== 0) {
        // Compressed Timestamp Header
        const localType = (rh >> 5) & 0x03;
        const timeOffset = rh & 0x1F;
        const def = defs[localType];
        if (!def) {
          break; // Unknown definition
        }
        // Timestamp rollover calculation
        const curOffset = lastTimestamp & 0x1F;
        let ts = (lastTimestamp & 0xFFFFFFE0) | timeOffset;
        if (timeOffset < curOffset) {
          ts += 0x20;
        }
        lastTimestamp = ts;

        const recData = parseDataMessage(view, pos, def, ts);
        if (def.globalId === 20) {
          records.push(recData);
        } else if (def.globalId === 19) {
          laps.push(recData);
        } else if (def.globalId === 18) {
          session = recData;
        }
        pos += def.totalSize;
      } else {
        // Normal Header
        const isDefinition = (rh & 0x40) !== 0;
        const hasDeveloper = (rh & 0x20) !== 0;
        const localType = rh & 0x0F;

        if (isDefinition) {
          if (pos + 5 > endPos) break;
          const reserved = view.getUint8(pos++);
          const arch = view.getUint8(pos++); // 0 = LE, 1 = BE
          const isLE = (arch === 0);
          const globalId = view.getUint16(pos, isLE);
          pos += 2;
          const numFields = view.getUint8(pos++);

          const fields = [];
          let totalSize = 0;
          for (let f = 0; f < numFields; f++) {
            if (pos + 3 > endPos) break;
            const fNum = view.getUint8(pos++);
            const fSize = view.getUint8(pos++);
            const fType = view.getUint8(pos++);
            fields.push({ num: fNum, size: fSize, type: fType });
            totalSize += fSize;
          }

          if (hasDeveloper) {
            if (pos < endPos) {
              const numDev = view.getUint8(pos++);
              for (let df = 0; df < numDev; df++) {
                if (pos + 3 > endPos) break;
                const dfNum = view.getUint8(pos++);
                const dfSize = view.getUint8(pos++);
                const dfIdx = view.getUint8(pos++);
                totalSize += dfSize;
              }
            }
          }

          defs[localType] = { globalId, fields, totalSize, isLE };
        } else {
          // Data message
          const def = defs[localType];
          if (!def) {
            break; // Cannot read without definition
          }

          const recData = parseDataMessage(view, pos, def, null);
          if (recData && recData.timestamp) {
            lastTimestamp = recData.timestamp;
          }

          if (def.globalId === 20) {
            // Global 20 = record
            records.push(recData);
          } else if (def.globalId === 19) {
            // Global 19 = lap
            laps.push(recData);
          } else if (def.globalId === 18) {
            // Global 18 = session
            session = recData;
          } else if (def.globalId === 0 && !fileId) {
            // Global 0 = file_id
            fileId = recData;
          } else if (def.globalId === 23 && !deviceInfo) {
            // Global 23 = device_info
            deviceInfo = recData;
          }

          pos += def.totalSize;
        }
      }
    }

    return {
      records,
      laps,
      session,
      fileId,
      deviceInfo,
      header: { headerSize, protoVer, profVer, dataSize }
    };
  }

  function parseDataMessage(view, offset, def, compressedTs) {
    let p = offset;
    const isLE = def.isLE;
    const data = {};

    if (compressedTs !== null) {
      data.timestamp = compressedTs;
    }

    for (let i = 0; i < def.fields.length; i++) {
      const f = def.fields[i];
      let val = null;

      try {
        switch (f.type & 0x7F) {
          case 0: // enum
          case 2: // uint8
            if (f.size === 1) val = view.getUint8(p);
            break;
          case 1: // sint8
            if (f.size === 1) val = view.getInt8(p);
            break;
          case 3: // sint16
            if (f.size === 2) val = view.getInt16(p, isLE);
            break;
          case 4: // uint16
            if (f.size === 2) val = view.getUint16(p, isLE);
            break;
          case 5: // sint32
            if (f.size === 4) val = view.getInt32(p, isLE);
            break;
          case 6: // uint32
            if (f.size === 4) val = view.getUint32(p, isLE);
            break;
          case 7: // string
            {
              let str = '';
              for (let s = 0; s < f.size; s++) {
                const b = view.getUint8(p + s);
                if (b === 0) break;
                str += String.fromCharCode(b);
              }
              val = str;
            }
            break;
          case 8: // float32
            if (f.size === 4) val = view.getFloat32(p, isLE);
            break;
          case 9: // float64
            if (f.size === 8) val = view.getFloat64(p, isLE);
            break;
          case 10: // uint8z
            if (f.size === 1) val = view.getUint8(p);
            break;
          case 11: // uint16z
            if (f.size === 2) val = view.getUint16(p, isLE);
            break;
          case 12: // uint32z
            if (f.size === 4) val = view.getUint32(p, isLE);
            break;
          default:
            val = null;
        }
      } catch (e) {
        val = null;
      }

      // Map record fields (globalId 20)
      if (def.globalId === 20) {
        if (f.num === 253 && val !== null) data.timestamp = val;
        else if (f.num === 3 && val !== null && val !== 255) data.heart_rate = val;
        else if (f.num === 4 && val !== null && val !== 255) data.cadence = val;
        else if (f.num === 53 && val !== null && val !== 255) {
          data.fractional_cadence = val / 128.0;
          data.raw_fractional_cadence = val;
        }
        else if (f.num === 52 && val !== null && val !== 65535) {
          data.cadence256 = val / 256.0;
          data.raw_cadence256 = val;
          if (data.cadence === undefined) data.cadence = Math.floor(val / 256.0);
        }
        else if (f.num === 85 && val !== null && val !== 65535) {
          data.step_length = val / 10.0;
          data.raw_step_length = val;
        }
        else if (f.num === 39 && val !== null && val !== 65535) {
          data.vertical_oscillation = val / 10.0;
          data.raw_vertical_oscillation = val;
        }
        else if (f.num === 83 && val !== null && val !== 65535) {
          data.vertical_ratio = val / 100.0;
          data.raw_vertical_ratio = val;
        }
        else if (f.num === 41 && val !== null && val !== 65535) {
          data.stance_time = val / 10.0;
          data.raw_stance_time = val;
        }
        else if (f.num === 5 && val !== null && val !== 4294967295) data.distance = val / 100.0; // meters
        else if (f.num === 6 && val !== null && val !== 65535) data.speed = val / 1000.0; // m/s
        else if (f.num === 73 && val !== null && val !== 4294967295) data.speed = val / 1000.0; // enhanced_speed
        else if (f.num === 0 && val !== null && val !== 2147483647) data.lat = val * (180.0 / 2147483648);
        else if (f.num === 1 && val !== null && val !== 2147483647) data.lon = val * (180.0 / 2147483648);
      } else if (def.globalId === 19) {
        // Map lap fields (globalId 19)
        if (f.num === 254 && val !== null && val !== 65535) data.message_index = val;
        else if (f.num === 253 && val !== null) data.timestamp = val;
        else if (f.num === 2 && val !== null) data.start_time = val;
        else if (f.num === 7 && val !== null && val !== 4294967295) data.total_elapsed_time = val / 1000.0;
        else if (f.num === 8 && val !== null && val !== 4294967295) data.total_timer_time = val / 1000.0;
        else if (f.num === 9 && val !== null && val !== 4294967295) data.total_distance = val / 100.0;
        else if (f.num === 11 && val !== null && val !== 65535) data.total_calories = val;
        else if (f.num === 15 && val !== null && val !== 255) data.avg_heart_rate = val;
        else if (f.num === 16 && val !== null && val !== 255) data.max_heart_rate = val;
        else if (f.num === 17 && val !== null && val !== 255) data.avg_cadence = val;
        else if (f.num === 18 && val !== null && val !== 255) data.max_cadence = val;
        else if (f.num === 80 && val !== null && val !== 255) {
          data.avg_fractional_cadence = val / 128.0;
          data.raw_avg_fractional_cadence = val;
        }
        else if (f.num === 120 && val !== null && val !== 65535) {
          data.avg_step_length = val / 10.0;
          data.raw_avg_step_length = val;
        }
        data[`f_${f.num}`] = val;
      } else if (def.globalId === 18) {
        // Map session fields (globalId 18)
        if (f.num === 253 && val !== null) data.timestamp = val;
        else if (f.num === 2 && val !== null) data.start_time = val;
        else if (f.num === 5 && val !== null && val !== 255) data.sport = val;
        else if (f.num === 6 && val !== null && val !== 255) data.sub_sport = val;
        else if (f.num === 10 && val !== null && val !== 4294967295) data.total_cycles = val;
        else if (f.num === 11 && val !== null && val !== 65535) data.total_calories = val;
        else if (f.num === 16 && val !== null && val !== 255) data.avg_heart_rate = val;
        else if (f.num === 17 && val !== null && val !== 255) data.max_heart_rate = val;
        else if (f.num === 18 && val !== null && val !== 255) data.avg_cadence = val;
        else if (f.num === 19 && val !== null && val !== 255) data.max_cadence = val;
        else if (f.num === 92 && val !== null && val !== 255) {
          data.avg_fractional_cadence = val / 128.0;
          data.raw_avg_fractional_cadence = val;
        }
        else if (f.num === 134 && val !== null && val !== 65535) {
          data.avg_step_length = val / 10.0;
          data.raw_avg_step_length = val;
        }
        else if (f.num === 89 && val !== null && val !== 65535) {
          data.avg_vertical_oscillation = val / 10.0;
          data.raw_avg_vertical_oscillation = val;
        }
        else if (f.num === 91 && val !== null && val !== 65535) {
          data.avg_stance_time = val / 10.0;
          data.raw_avg_stance_time = val;
        }
        else if (f.num === 132 && val !== null && val !== 65535) {
          data.avg_vertical_ratio = val / 100.0;
          data.raw_avg_vertical_ratio = val;
        }
        data[`f_${f.num}`] = val;
      } else {
        data[`f_${f.num}`] = val;
      }

      p += f.size;
    }

    return data;
  }

  // --- Speed Phases & Synchronization Analysis (A.fit vs Q.fit) ---
  function detectSpeedPhases(records, minDurationSec = 20) {
    if (!records || records.length === 0) return [];

    const speeds = records.map(r => parseFloat(r.speed || 0) || 0);
    const runs = [];
    let curSpeed = speeds[0];
    let curCount = 0;
    let curStartIdx = 0;

    for (let i = 0; i < speeds.length; i++) {
      const s = speeds[i];
      if (Math.abs(s - curSpeed) < 0.05) {
        curCount++;
      } else {
        if (curCount >= minDurationSec) {
          runs.push({
            speed_ms: parseFloat(curSpeed.toFixed(3)),
            speed_kmh: msToKmh(curSpeed),
            pace_str: kmhToPaceStr(msToKmh(curSpeed)),
            duration_sec: curCount,
            duration_min: parseFloat((curCount / 60.0).toFixed(2)),
            start_idx: curStartIdx,
            end_idx: curStartIdx + curCount - 1
          });
        }
        curSpeed = s;
        curCount = 1;
        curStartIdx = i;
      }
    }

    if (curCount >= minDurationSec) {
      runs.push({
        speed_ms: parseFloat(curSpeed.toFixed(3)),
        speed_kmh: msToKmh(curSpeed),
        pace_str: kmhToPaceStr(msToKmh(curSpeed)),
        duration_sec: curCount,
        duration_min: parseFloat((curCount / 60.0).toFixed(2)),
        start_idx: curStartIdx,
        end_idx: curStartIdx + curCount - 1
      });
    }

    return runs;
  }

  function analyzeSync(aRecords, qRecords) {
    if (!aRecords || !qRecords || aRecords.length === 0 || qRecords.length === 0) {
      return { has_sync: false, error: 'One or both files contain no records.' };
    }

    const aFirstTs = parseInt(aRecords[0].timestamp || 0, 10);
    const qFirstTs = parseInt(qRecords[0].timestamp || 0, 10);
    const clockOffset = qFirstTs - aFirstTs;

    // Movement start detection (speed >= 0.3 m/s or cadence >= 40)
    let aMoveIdx = 0;
    for (let i = 0; i < aRecords.length; i++) {
      if ((aRecords[i].speed || 0) >= 0.3 || (aRecords[i].cadence || 0) >= 40) {
        aMoveIdx = i;
        break;
      }
    }

    let qMoveIdx = 0;
    for (let i = 0; i < qRecords.length; i++) {
      if ((qRecords[i].speed || 0) >= 0.3 || (qRecords[i].cadence || 0) >= 40) {
        qMoveIdx = i;
        break;
      }
    }

    const aMoveTs = parseInt(aRecords[aMoveIdx]?.timestamp || aFirstTs, 10);
    const qMoveTs = parseInt(qRecords[qMoveIdx]?.timestamp || qFirstTs, 10);
    const movementOffsetClock = qMoveTs - aMoveTs;

    // Detect speed phases in Q
    const qPhases = detectSpeedPhases(qRecords, 20);

    // Stationary records at start of A
    let aStationaryCount = 0;
    for (let i = 0; i < Math.min(60, aRecords.length); i++) {
      if ((aRecords[i].speed || 0) < 0.3) {
        aStationaryCount++;
      } else {
        break;
      }
    }

    return {
      has_sync: true,
      a_total_records: aRecords.length,
      q_total_records: qRecords.length,
      a_start_ts: aFirstTs,
      q_start_ts: qFirstTs,
      clock_offset_sec: clockOffset,
      a_movement_index: aMoveIdx,
      q_movement_index: qMoveIdx,
      movement_offset_sec: movementOffsetClock,
      a_leading_stationary_count: aStationaryCount,
      detected_q_phases: qPhases
    };
  }

  // --- Workout Building & Plan Synthesis ---
  function parseDurationToSeconds(dur, secPart = 0) {
    if (dur === null || dur === undefined) return Math.max(0, parseInt(secPart, 10) || 0);
    if (typeof dur === 'object') {
      const m = parseInt(dur.min, 10) || 0;
      const s = parseInt(dur.sec !== undefined ? dur.sec : secPart, 10) || 0;
      return Math.max(0, m * 60 + s);
    }
    if (typeof dur === 'string') {
      const str = dur.trim();
      if (str.includes(':')) {
        const parts = str.split(':');
        const m = parseInt(parts[0], 10) || 0;
        const s = parseFloat(parts[1]) || 0;
        return Math.max(0, Math.round(m * 60 + s));
      }
      const val = parseFloat(str);
      if (!isNaN(val)) {
        return Math.max(0, Math.round(val * 60 + (parseInt(secPart, 10) || 0)));
      }
    }
    const fVal = parseFloat(dur) || 0;
    const sVal = parseInt(secPart, 10) || 0;
    return Math.max(0, Math.round(fVal * 60 + sVal));
  }

  function buildWorkoutPlan(config) {
    const { mode } = config;

    if (mode === 'custom_segments') {
      return buildCustomSegmentsPlan(config);
    } else {
      return buildRepeatsPlan(config);
    }
  }

  function buildRepeatsPlan(config) {
    const calcMode = config.calcMode || 'duration'; // 'duration' or 'distance'
    const warmupSpd = kmhToMs(config.warmupKmh || 10.6);
    let warmupDur = 0;
    if (calcMode === 'distance' && parseFloat(config.warmupDistKm) > 0 && warmupSpd > 0) {
      warmupDur = Math.round((parseFloat(config.warmupDistKm) * 1000.0) / warmupSpd);
    } else {
      warmupDur = parseDurationToSeconds(config.warmupMin, config.warmupSec);
    }

    const repeats = parseInt(config.repeats, 10) || 3;
    const intSpd = kmhToMs(config.intKmh || 13.7);
    let intDur = 0;
    if (calcMode === 'distance' && parseFloat(config.intDistKm) > 0 && intSpd > 0) {
      intDur = Math.round((parseFloat(config.intDistKm) * 1000.0) / intSpd);
    } else {
      intDur = parseDurationToSeconds(config.intMin, config.intSec);
    }

    const recSpd = kmhToMs(config.recKmh || 5.7);
    let recDur = 0;
    if (calcMode === 'distance' && parseFloat(config.recDistKm) > 0 && recSpd > 0) {
      recDur = Math.round((parseFloat(config.recDistKm) * 1000.0) / recSpd);
    } else {
      recDur = parseDurationToSeconds(config.recMin, config.recSec);
    }

    const cdSpd = kmhToMs(config.cdKmh || 10.6);
    const cdMode = config.cdMode || 'auto_distance';
    const targetDistM = (parseFloat(config.targetDistKm) || 0) * 1000.0;

    let priorDistM = warmupDur * warmupSpd;
    priorDistM += repeats * (intDur * intSpd + recDur * recSpd);

    let cdDur = 0;
    if (cdMode === 'auto_distance' && targetDistM > 0) {
      const remDist = Math.max(0, targetDistM - priorDistM);
      if (cdSpd > 0) {
        cdDur = Math.round(remDist / cdSpd);
      }
    } else {
      if (calcMode === 'distance' && parseFloat(config.cdManualDistKm) > 0 && cdSpd > 0) {
        cdDur = Math.round((parseFloat(config.cdManualDistKm) * 1000.0) / cdSpd);
      } else {
        cdDur = parseDurationToSeconds(config.cdManualMin, config.cdManualSec);
      }
    }

    const laps = [];
    const targetSpeeds = [];

    // 1. Warm Up
    if (warmupDur > 0) {
      laps.push({
        phase: 'Warm Up',
        duration: warmupDur,
        speed_ms: warmupSpd,
        speed_kmh: msToKmh(warmupSpd),
        pace_str: kmhToPaceStr(msToKmh(warmupSpd)),
        intensity: 'Active'
      });
      for (let i = 0; i < warmupDur; i++) targetSpeeds.push(warmupSpd);
    }

    // 2. Repeats
    for (let r = 0; r < repeats; r++) {
      if (intDur > 0) {
        laps.push({
          phase: `Interval ${r + 1}`,
          duration: intDur,
          speed_ms: intSpd,
          speed_kmh: msToKmh(intSpd),
          pace_str: kmhToPaceStr(msToKmh(intSpd)),
          intensity: 'Active'
        });
        for (let i = 0; i < intDur; i++) targetSpeeds.push(intSpd);
      }
      if (recDur > 0) {
        laps.push({
          phase: `Recovery ${r + 1}`,
          duration: recDur,
          speed_ms: recSpd,
          speed_kmh: msToKmh(recSpd),
          pace_str: kmhToPaceStr(msToKmh(recSpd)),
          intensity: 'Resting'
        });
        for (let i = 0; i < recDur; i++) targetSpeeds.push(recSpd);
      }
    }

    // 3. Cool Down
    if (cdDur > 0) {
      laps.push({
        phase: 'Cool Down',
        duration: cdDur,
        speed_ms: cdSpd,
        speed_kmh: msToKmh(cdSpd),
        pace_str: kmhToPaceStr(msToKmh(cdSpd)),
        intensity: 'Active'
      });
      for (let i = 0; i < cdDur; i++) targetSpeeds.push(cdSpd);
    }

    return { laps, targetSpeeds };
  }

  function buildCustomSegmentsPlan(config) {
    const rawSegments = config.segments || [];
    const targetDistM = (parseFloat(config.targetDistKm) || 0) * 1000.0;
    const autoCalcFinal = config.autoCalcFinal !== false;
    const globalCalcMode = config.calcMode || 'duration';

    if (rawSegments.length === 0) {
      return { laps: [], targetSpeeds: [] };
    }

    function calcSegDur(s) {
      const spd = kmhToMs(s.speedKmh || 0);
      const mode = s.calcMode || globalCalcMode;
      if (mode === 'distance' && parseFloat(s.distKm) > 0 && spd > 0) {
        return Math.round((parseFloat(s.distKm) * 1000.0) / spd);
      }
      return parseDurationToSeconds(s.min !== undefined ? s.min : s.durationMin, s.sec);
    }

    // Prior distance calculation
    const num = rawSegments.length;
    let priorDistM = 0;
    for (let i = 0; i < num - 1; i++) {
      const s = rawSegments[i];
      const dur = calcSegDur(s);
      const spd = kmhToMs(s.speedKmh || 0);
      priorDistM += dur * spd;
    }

    const lastSeg = Object.assign({}, rawSegments[num - 1]);
    const lastSpd = kmhToMs(lastSeg.speedKmh || 0);
    let lastDur = calcSegDur(lastSeg);

    if (autoCalcFinal && targetDistM > 0 && lastSeg.autoCalc) {
      const remDist = Math.max(0, targetDistM - priorDistM);
      if (lastSpd > 0) {
        lastDur = Math.round(remDist / lastSpd);
        lastSeg.durationMin = parseFloat((lastDur / 60.0).toFixed(2));
      }
    }

    const laps = [];
    const targetSpeeds = [];

    for (let i = 0; i < num; i++) {
      const s = (i === num - 1) ? lastSeg : rawSegments[i];
      const dur = (i === num - 1) ? lastDur : calcSegDur(s);
      const spd = kmhToMs(s.speedKmh || 0);
      if (dur <= 0) continue;

      laps.push({
        phase: s.name || `Segment ${i + 1}`,
        duration: dur,
        speed_ms: spd,
        speed_kmh: msToKmh(spd),
        pace_str: kmhToPaceStr(msToKmh(spd)),
        intensity: s.intensity || 'Active'
      });

      for (let j = 0; j < dur; j++) {
        targetSpeeds.push(spd);
      }
    }

    return { laps, targetSpeeds };
  }

  // --- Full Processing Pipeline ---
  function processWorkout(sourceFitBuffer, config) {
    const {
      trimStationary = true,
      stationaryThreshold = 0.3,
      deviceType = 'Amazfit T-Rex 3',
      centerLat = 3.139000,
      centerLon = 101.686900
    } = config;

    // 1. Decode A.fit
    const decoded = decodeFitBinary(sourceFitBuffer);
    let recs = decoded.records;
    if (!recs || recs.length === 0) {
      throw new Error('No record messages found in uploaded FIT file.');
    }

    // 2. Trim leading stationary records (< 0.3 m/s)
    let droppedCount = 0;
    if (trimStationary) {
      const maxDroppable = Math.max(0, recs.length - 10);
      for (let i = 0; i < maxDroppable; i++) {
        const s = recs[i].speed !== undefined ? recs[i].speed : 0;
        if (s < stationaryThreshold) {
          droppedCount++;
        } else {
          break;
        }
      }
    }
    const trimmedRecs = recs.slice(droppedCount);

    // 3. Build workout schedule
    const plan = buildWorkoutPlan(config);
    const targetSpeeds = plan.targetSpeeds;
    const totalRecords = targetSpeeds.length;

    if (totalRecords === 0) {
      throw new Error('Workout plan has 0 seconds duration. Please configure intervals.');
    }

    const startTs = (trimmedRecs[0] && trimmedRecs[0].timestamp) ? trimmedRecs[0].timestamp : 1000000000;

    // 4. Pad or trim records to match totalRecords (preserving exact A.fit cadence & running dynamics)
    const finalRecs = [];
    const sourceLen = trimmedRecs.length;
    const lastRec = trimmedRecs[sourceLen - 1] || { heart_rate: 140, cadence: null };

    for (let i = 0; i < totalRecords; i++) {
      let r;
      if (i < sourceLen) {
        r = Object.assign({}, trimmedRecs[i]);
      } else {
        r = Object.assign({}, lastRec);
      }

      const spd = targetSpeeds[i];
      r.timestamp = startTs + i;
      r.calc_speed = spd;
      r.heart_rate = (r.heart_rate !== undefined && r.heart_rate !== null) ? r.heart_rate : 140;
      r.cadence = (r.cadence !== undefined && r.cadence !== null) ? r.cadence : null;

      finalRecs.push(r);
    }

    // 5. Update cumulative distance & track GPS coordinates
    let cumDist = 0.0;
    for (let i = 0; i < totalRecords; i++) {
      const r = finalRecs[i];
      cumDist += r.calc_speed;
      r.calc_distance = cumDist;

      const track = getTrackCoords(cumDist, centerLat, centerLon);
      r.lat = track.lat;
      r.lon = track.lon;
      r.semilat = track.semilat;
      r.semilon = track.semilon;
    }

    // Overall A.fit cadence and HR statistics
    const allCads = finalRecs.map(x => x.cadence).filter(x => x !== null && x !== undefined);
    const overallAvgCad = allCads.length > 0 ? Math.round(allCads.reduce((a, b) => a + b, 0) / allCads.length) : 0;
    const overallMaxCad = allCads.length > 0 ? Math.max(...allCads) : overallAvgCad;
    const allHrs = finalRecs.map(x => x.heart_rate).filter(x => x && x > 30);
    const overallAvgHr = allHrs.length > 0 ? Math.round(allHrs.reduce((a, b) => a + b, 0) / allHrs.length) : 140;
    const overallMaxHr = allHrs.length > 0 ? Math.max(...allHrs) : 150;

    // 6. Build Lap Summaries strictly following A.fit cadence & telemetry
    let recPtr = 0;
    let currLapStart = startTs;
    const lapsSummary = [];
    const exactLapMatch = Boolean(decoded.laps && decoded.laps.length === plan.laps.length);

    for (let i = 0; i < plan.laps.length; i++) {
      const spec = plan.laps[i];
      const dur = spec.duration;
      const spd = spec.speed_ms;
      const dist = dur * spd;

      const lapRecs = finalRecs.slice(recPtr, recPtr + dur);
      const hrs = lapRecs.map(x => x.heart_rate).filter(x => x && x > 30);
      const cads = lapRecs.map(x => x.cadence).filter(x => x !== null && x !== undefined);
      const cads256 = lapRecs.map(x => x.cadence256).filter(x => x !== null && x !== undefined);
      const steps = lapRecs.map(x => x.step_length).filter(x => x !== null && x !== undefined);

      const recAvgHr = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : overallAvgHr;
      const recMaxHr = hrs.length > 0 ? Math.max(...hrs) : Math.max(recAvgHr, 150);

      let recAvgCad = overallAvgCad;
      if (cads256.length > 0) {
        recAvgCad = Math.round(cads256.reduce((a, b) => a + b, 0) / cads256.length);
      } else if (cads.length > 0) {
        recAvgCad = Math.round(cads.reduce((a, b) => a + b, 0) / cads.length);
      }
      const recMaxCad = cads.length > 0 ? Math.max(...cads) : recAvgCad;
      const recAvgStep = steps.length > 0 ? Math.round((steps.reduce((a, b) => a + b, 0) / steps.length) * 10) / 10 : null;

      let lapCalories = Math.round(dur * (spd / 2.944) * 0.14);
      if (spd <= 2.0) lapCalories = Math.round(dur * 0.08);
      if (lapCalories < 5) lapCalories = 5;

      let avgCad = recAvgCad;
      let maxCad = recMaxCad;
      let avgHr = recAvgHr;
      let maxHr = recMaxHr;
      let avgStepLength = recAvgStep;
      let rawAvgStepLength = recAvgStep !== null ? Math.round(recAvgStep * 10) : 65535;
      let avgFracCad = null;
      let rawAvgFracCad = 255;

      if (exactLapMatch) {
        const origLap = decoded.laps[i];
        if (origLap.avg_cadence !== undefined && origLap.avg_cadence !== null) avgCad = origLap.avg_cadence;
        if (origLap.max_cadence !== undefined && origLap.max_cadence !== null) maxCad = origLap.max_cadence;
        if (origLap.avg_heart_rate !== undefined && origLap.avg_heart_rate !== null) avgHr = origLap.avg_heart_rate;
        if (origLap.max_heart_rate !== undefined && origLap.max_heart_rate !== null) maxHr = origLap.max_heart_rate;
        if (origLap.total_calories !== undefined && origLap.total_calories !== null) lapCalories = origLap.total_calories;
        if (origLap.avg_step_length !== undefined && origLap.avg_step_length !== null) {
          avgStepLength = origLap.avg_step_length;
          rawAvgStepLength = origLap.raw_avg_step_length !== undefined ? origLap.raw_avg_step_length : Math.round(origLap.avg_step_length * 10);
        }
        if (origLap.avg_fractional_cadence !== undefined && origLap.avg_fractional_cadence !== null) {
          avgFracCad = origLap.avg_fractional_cadence;
          rawAvgFracCad = origLap.raw_avg_fractional_cadence !== undefined ? origLap.raw_avg_fractional_cadence : Math.round(origLap.avg_fractional_cadence * 128);
        }
      }

      lapsSummary.push({
        lap_index: i,
        phase: spec.phase,
        duration_sec: dur,
        duration_str: formatDuration(dur),
        speed_kmh: spec.speed_kmh,
        pace_str: spec.pace_str,
        distance_m: Math.round(dist * 100) / 100,
        avg_hr: avgHr,
        max_hr: maxHr,
        avg_cadence: avgCad,
        max_cadence: maxCad,
        avg_fractional_cadence: avgFracCad,
        raw_avg_fractional_cadence: rawAvgFracCad,
        avg_step_length: avgStepLength,
        raw_avg_step_length: rawAvgStepLength,
        calories: lapCalories,
        intensity: spec.intensity || 'Active',
        start_time: currLapStart
      });

      currLapStart += dur;
      recPtr += dur;
    }

    const totalDistM = cumDist;
    const avgSpdMs = totalDistM / totalRecords;
    const totalLapCalories = lapsSummary.reduce((sum, l) => sum + (l.calories || 0), 0);

    const origSess = decoded.session || {};
    const sessionSummary = {
      avg_cadence: origSess.avg_cadence !== undefined ? origSess.avg_cadence : overallAvgCad,
      max_cadence: origSess.max_cadence !== undefined ? origSess.max_cadence : overallMaxCad,
      avg_fractional_cadence: origSess.avg_fractional_cadence !== undefined ? origSess.avg_fractional_cadence : null,
      raw_avg_fractional_cadence: origSess.raw_avg_fractional_cadence !== undefined ? origSess.raw_avg_fractional_cadence : 255,
      total_cycles: origSess.total_cycles !== undefined ? origSess.total_cycles : 4294967295,
      avg_step_length: origSess.avg_step_length !== undefined ? origSess.avg_step_length : null,
      raw_avg_step_length: origSess.raw_avg_step_length !== undefined ? origSess.raw_avg_step_length : 65535,
      avg_vertical_oscillation: origSess.avg_vertical_oscillation !== undefined ? origSess.avg_vertical_oscillation : null,
      raw_avg_vertical_oscillation: origSess.raw_avg_vertical_oscillation !== undefined ? origSess.raw_avg_vertical_oscillation : 65535,
      avg_stance_time: origSess.avg_stance_time !== undefined ? origSess.avg_stance_time : null,
      raw_avg_stance_time: origSess.raw_avg_stance_time !== undefined ? origSess.raw_avg_stance_time : 65535,
      avg_vertical_ratio: origSess.avg_vertical_ratio !== undefined ? origSess.avg_vertical_ratio : null,
      raw_avg_vertical_ratio: origSess.raw_avg_vertical_ratio !== undefined ? origSess.raw_avg_vertical_ratio : 65535,
      avg_heart_rate: origSess.avg_heart_rate !== undefined ? origSess.avg_heart_rate : overallAvgHr,
      max_heart_rate: origSess.max_heart_rate !== undefined ? origSess.max_heart_rate : overallMaxHr,
      total_calories: origSess.total_calories !== undefined ? origSess.total_calories : totalLapCalories
    };

    const workoutResult = {
      success: true,
      total_records: totalRecords,
      total_time_sec: totalRecords,
      total_time_str: formatDuration(totalRecords),
      total_distance_m: Math.round(totalDistM * 100) / 100,
      total_distance_km: parseFloat((totalDistM / 1000.0).toFixed(3)),
      avg_speed_kmh: parseFloat((avgSpdMs * 3.6).toFixed(2)),
      avg_pace_str: kmhToPaceStr(avgSpdMs * 3.6),
      max_speed_kmh: parseFloat((Math.max(...targetSpeeds) * 3.6).toFixed(2)),
      stationary_dropped: droppedCount,
      device_type: deviceType,
      start_ts: startTs,
      laps: lapsSummary,
      session: sessionSummary,
      records: finalRecs
    };

    return workoutResult;
  }

  // --- XML File Builders: TCX & GPX ---
  function buildTCX(result, withGps = true) {
    const startIso = fitTsToIso(result.start_ts);
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<TrainingCenterDatabase',
      '  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"',
      '  xmlns:ns5="http://www.garmin.com/xmlschemas/ActivityGoals/v1"',
      '  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"',
      '  xmlns:ns2="http://www.garmin.com/xmlschemas/UserProfile/v2"',
      '  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      '  <Activities>',
      '    <Activity Sport="Running">',
      `      <Id>${startIso}</Id>`
    ];

    let recPtr = 0;
    for (let i = 0; i < result.laps.length; i++) {
      const lap = result.laps[i];
      const dur = lap.duration_sec;
      const spd = lap.speed_kmh / 3.6;
      const dist = lap.distance_m;
      const cal = lap.calories;
      const lapStartIso = fitTsToIso(lap.start_time);

      lines.push(`      <Lap StartTime="${lapStartIso}">`);
      lines.push(`        <TotalTimeSeconds>${dur.toFixed(1)}</TotalTimeSeconds>`);
      lines.push(`        <DistanceMeters>${dist.toFixed(2)}</DistanceMeters>`);
      lines.push(`        <MaximumSpeed>${spd.toFixed(3)}</MaximumSpeed>`);
      lines.push(`        <Calories>${cal}</Calories>`);
      lines.push(`        <AverageHeartRateBpm><Value>${lap.avg_hr}</Value></AverageHeartRateBpm>`);
      lines.push(`        <MaximumHeartRateBpm><Value>${lap.max_hr}</Value></MaximumHeartRateBpm>`);
      lines.push(`        <Intensity>${lap.intensity}</Intensity>`);
      lines.push(`        <Cadence>${lap.avg_cadence}</Cadence>`);
      lines.push('        <TriggerMethod>Manual</TriggerMethod>');
      lines.push('        <Track>');

      const lapRecs = result.records.slice(recPtr, recPtr + dur);
      for (let j = 0; j < lapRecs.length; j++) {
        const r = lapRecs[j];
        const ptIso = fitTsToIso(r.timestamp);
        const hasCad = (r.cadence !== null && r.cadence !== undefined);
        lines.push('          <Trackpoint>');
        lines.push(`            <Time>${ptIso}</Time>`);
        if (withGps && r.lat && r.lon) {
          lines.push('            <Position>');
          lines.push(`              <LatitudeDegrees>${r.lat.toFixed(7)}</LatitudeDegrees>`);
          lines.push(`              <LongitudeDegrees>${r.lon.toFixed(7)}</LongitudeDegrees>`);
          lines.push('            </Position>');
          lines.push('            <AltitudeMeters>15.0</AltitudeMeters>');
        }
        lines.push(`            <DistanceMeters>${r.calc_distance.toFixed(2)}</DistanceMeters>`);
        lines.push(`            <HeartRateBpm><Value>${r.heart_rate}</Value></HeartRateBpm>`);
        if (hasCad) {
          lines.push(`            <Cadence>${Math.round(r.cadence)}</Cadence>`);
        }
        lines.push('            <Extensions>');
        lines.push('              <ns3:TPX>');
        lines.push(`                <ns3:Speed>${r.calc_speed.toFixed(3)}</ns3:Speed>`);
        if (hasCad) {
          lines.push(`                <ns3:RunCadence>${Math.round(r.cadence)}</ns3:RunCadence>`);
        }
        lines.push('              </ns3:TPX>');
        lines.push('            </Extensions>');
        lines.push('          </Trackpoint>');
      }

      lines.push('        </Track>');
      lines.push('      </Lap>');
      recPtr += dur;
    }

    lines.push('      <Creator xsi:type="Device_t">');
    lines.push(`        <Name>${result.device_type}</Name>`);
    lines.push('        <UnitId>8716547</UnitId>');
    lines.push('        <ProductID>133</ProductID>');
    lines.push('      </Creator>');
    lines.push('    </Activity>');
    lines.push('  </Activities>');
    lines.push('</TrainingCenterDatabase>');

    return lines.join('\n');
  }

  function buildGPX(result) {
    const startIso = fitTsToIso(result.start_ts);
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<gpx version="1.1" creator="${result.device_type}"`,
      '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd"',
      '  xmlns="http://www.topografix.com/GPX/1/1"',
      '  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
      '  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"',
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      '  <metadata>',
      '    <name>Interval Workout</name>',
      `    <time>${startIso}</time>`,
      '  </metadata>',
      '  <trk>',
      '    <name>Interval Workout</name>',
      '    <type>running</type>',
      '    <trkseg>'
    ];

    for (let i = 0; i < result.records.length; i++) {
      const r = result.records[i];
      const ptIso = fitTsToIso(r.timestamp);
      lines.push(`      <trkpt lat="${r.lat.toFixed(7)}" lon="${r.lon.toFixed(7)}">`);
      lines.push('        <ele>15.0</ele>');
      lines.push(`        <time>${ptIso}</time>`);
      lines.push('        <extensions>');
      lines.push('          <gpxtpx:TrackPointExtension>');
      lines.push(`            <gpxtpx:speed>${r.calc_speed.toFixed(3)}</gpxtpx:speed>`);
      lines.push(`            <gpxtpx:hr>${r.heart_rate}</gpxtpx:hr>`);
      if (r.cadence !== null && r.cadence !== undefined) {
        lines.push(`            <gpxtpx:cad>${Math.round(r.cadence)}</gpxtpx:cad>`);
      }
      lines.push('          </gpxtpx:TrackPointExtension>');
      lines.push('        </extensions>');
      lines.push('      </trkpt>');
    }

    lines.push('    </trkseg>');
    lines.push('  </trk>');
    lines.push('</gpx>');

    return lines.join('\n');
  }

  // --- FitCSVTool Compatible CSV Builder ---
  function buildFitCSV(result, withGps = false) {
    const lines = [];

    // 1. file_id
    lines.push('Type,Local Number,Message,Field 1,Value 1,Units 1,Field 2,Value 2,Units 2,Field 3,Value 3,Units 3,Field 4,Value 4,Units 4,Field 5,Value 5,Units 5,Field 6,Value 6,Units 6,Field 7,Value 7,Units 7,Field 8,Value 8,Units 8,Field 9,Value 9,Units 9,Field 10,Value 10,Units 10,Field 11,Value 11,Units 11,Field 12,Value 12,Units 12,Field 13,Value 13,Units 13,Field 14,Value 14,Units 14,Field 15,Value 15,Units 15,');
    lines.push('Definition,0,file_id,type,1,,manufacturer,1,,product,1,,serial_number,1,,time_created,1,,');
    lines.push(`Data,0,file_id,type,"4",,manufacturer,"339",,product,"133",,serial_number,"8716547",,time_created,"${result.start_ts}",,`);

    // 2. device_info
    lines.push('Definition,1,device_info,timestamp,1,,serial_number,1,,manufacturer,1,,product,1,,product_name,1,,');
    lines.push(`Data,1,device_info,timestamp,"${result.start_ts}",s,serial_number,"8716547",,manufacturer,"339",,product,"133",,product_name,"${result.device_type}",,`);

    // 3. event (start)
    lines.push('Definition,2,event,timestamp,1,,event,1,,event_type,1,,');
    lines.push(`Data,2,event,timestamp,"${result.start_ts}",s,event,"0",,event_type,"0",,`);

    // 4. record definition & data
    if (withGps) {
      lines.push('Definition,3,record,timestamp,1,,distance,1,,speed,1,,heart_rate,1,,cadence,1,,cadence256,1,,enhanced_speed,1,,position_lat,1,,position_long,1,,');
    } else {
      lines.push('Definition,3,record,timestamp,1,,distance,1,,speed,1,,heart_rate,1,,cadence,1,,cadence256,1,,enhanced_speed,1,,');
    }

    for (let i = 0; i < result.records.length; i++) {
      const r = result.records[i];
      const cadVal = (r.cadence !== null && r.cadence !== undefined) ? r.cadence : 0;
      const cad256Val = (r.cadence256 !== null && r.cadence256 !== undefined) ? r.cadence256.toFixed(1) : cadVal.toFixed(1);
      if (withGps) {
        lines.push(`Data,3,record,timestamp,"${r.timestamp}",s,distance,"${r.calc_distance.toFixed(2)}",m,speed,"${r.calc_speed.toFixed(3)}",m/s,heart_rate,"${r.heart_rate}",bpm,cadence,"${cadVal}",rpm,cadence256,"${cad256Val}",rpm,enhanced_speed,"${r.calc_speed.toFixed(3)}",m/s,position_lat,"${r.semilat}",semicircles,position_long,"${r.semilon}",semicircles,`);
      } else {
        lines.push(`Data,3,record,timestamp,"${r.timestamp}",s,distance,"${r.calc_distance.toFixed(2)}",m,speed,"${r.calc_speed.toFixed(3)}",m/s,heart_rate,"${r.heart_rate}",bpm,cadence,"${cadVal}",rpm,cadence256,"${cad256Val}",rpm,enhanced_speed,"${r.calc_speed.toFixed(3)}",m/s,`);
      }
    }

    // 5. lap
    lines.push('Definition,4,lap,timestamp,1,,start_time,1,,total_elapsed_time,1,,total_timer_time,1,,total_distance,1,,avg_speed,1,,max_speed,1,,total_calories,1,,avg_heart_rate,1,,max_heart_rate,1,,avg_cadence,1,,message_index,1,,intensity,1,,');
    for (let i = 0; i < result.laps.length; i++) {
      const l = result.laps[i];
      const lapEnd = l.start_time + l.duration_sec;
      lines.push(`Data,4,lap,timestamp,"${lapEnd}",s,start_time,"${l.start_time}",,total_elapsed_time,"${l.duration_sec.toFixed(3)}",s,total_timer_time,"${l.duration_sec.toFixed(3)}",s,total_distance,"${l.distance_m.toFixed(2)}",m,avg_speed,"${(l.speed_kmh / 3.6).toFixed(3)}",m/s,max_speed,"${(l.speed_kmh / 3.6).toFixed(3)}",m/s,total_calories,"${l.calories}",kcal,avg_heart_rate,"${l.avg_hr}",bpm,max_heart_rate,"${l.max_hr}",bpm,avg_cadence,"${l.avg_cadence}",rpm,message_index,"${l.lap_index}",,intensity,"${l.intensity === 'Resting' ? '1' : '0'}",,`);
    }

    // 6. session
    const totalSec = result.total_time_sec;
    const sessionEnd = result.start_ts + totalSec;
    const avgSpd = result.total_distance_m / totalSec;
    const sess = result.session || {};
    const sessAvgCad = sess.avg_cadence !== undefined ? sess.avg_cadence : 86;
    const sessMaxCad = sess.max_cadence !== undefined ? sess.max_cadence : 95;
    const sessAvgHr = sess.avg_heart_rate !== undefined ? sess.avg_heart_rate : 144;
    const sessMaxHr = sess.max_heart_rate !== undefined ? sess.max_heart_rate : 164;
    const sessCal = sess.total_calories !== undefined ? sess.total_calories : 600;
    lines.push('Definition,5,session,timestamp,1,,start_time,1,,total_elapsed_time,1,,total_timer_time,1,,total_distance,1,,total_calories,1,,avg_heart_rate,1,,max_heart_rate,1,,avg_cadence,1,,max_cadence,1,,avg_speed,1,,max_speed,1,,first_lap_index,1,,num_laps,1,,sport,1,,');
    lines.push(`Data,5,session,timestamp,"${sessionEnd}",s,start_time,"${result.start_ts}",,total_elapsed_time,"${totalSec.toFixed(3)}",s,total_timer_time,"${totalSec.toFixed(3)}",s,total_distance,"${result.total_distance_m.toFixed(2)}",m,total_calories,"${sessCal}",kcal,avg_heart_rate,"${sessAvgHr}",bpm,max_heart_rate,"${sessMaxHr}",bpm,avg_running_cadence,"${sessAvgCad}",rpm,max_running_cadence,"${sessMaxCad}",rpm,avg_speed,"${avgSpd.toFixed(3)}",m/s,max_speed,"${(result.max_speed_kmh / 3.6).toFixed(3)}",m/s,first_lap_index,"0",,num_laps,"${result.laps.length}",,sport,"1",,`);

    // 7. activity
    lines.push('Definition,6,activity,timestamp,1,,total_timer_time,1,,num_sessions,1,,type,1,,event,1,,event_type,1,,');
    lines.push(`Data,6,activity,timestamp,"${sessionEnd}",s,total_timer_time,"${totalSec.toFixed(3)}",s,num_sessions,"1",,type,"0",,event,"0",,event_type,"1",,`);

    return lines.join('\n');
  }

  // --- Pure Binary FIT File Builder ---
  function buildBinaryFIT(result, withGps = false) {
    const bodyBytes = [];

    function pushByte(b) { bodyBytes.push(b & 0xFF); }
    function pushUint16(val) {
      bodyBytes.push(val & 0xFF);
      bodyBytes.push((val >> 8) & 0xFF);
    }
    function pushInt32(val) {
      bodyBytes.push(val & 0xFF);
      bodyBytes.push((val >> 8) & 0xFF);
      bodyBytes.push((val >> 16) & 0xFF);
      bodyBytes.push((val >> 24) & 0xFF);
    }
    function pushUint32(val) {
      bodyBytes.push(val & 0xFF);
      bodyBytes.push((val >> 8) & 0xFF);
      bodyBytes.push((val >> 16) & 0xFF);
      bodyBytes.push((val >> 24) & 0xFF);
    }

    // 1. Def 0: file_id (global 0)
    pushByte(0x40); pushByte(0x00); pushByte(0x00); pushUint16(0); pushByte(5);
    pushByte(0); pushByte(1); pushByte(0);       // type: enum
    pushByte(1); pushByte(2); pushByte(132);     // manufacturer: uint16
    pushByte(2); pushByte(2); pushByte(132);     // product: uint16
    pushByte(3); pushByte(4); pushByte(140);     // serial_number: uint32z
    pushByte(4); pushByte(4); pushByte(134);     // time_created: uint32

    // Data 0: file_id
    pushByte(0x00);
    pushByte(4); pushUint16(339); pushUint16(133); pushUint32(8716547); pushUint32(result.start_ts);

    // 2. Def 1: device_info (global 23)
    pushByte(0x41); pushByte(0x00); pushByte(0x00); pushUint16(23); pushByte(4);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp: uint32
    pushByte(1); pushByte(4); pushByte(140);     // serial_number: uint32z
    pushByte(2); pushByte(2); pushByte(132);     // manufacturer: uint16
    pushByte(4); pushByte(2); pushByte(132);     // product: uint16

    // Data 1: device_info
    pushByte(0x01);
    pushUint32(result.start_ts); pushUint32(8716547); pushUint16(339); pushUint16(133);

    // 3. Def 2: event (global 21)
    pushByte(0x42); pushByte(0x00); pushByte(0x00); pushUint16(21); pushByte(3);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp
    pushByte(0); pushByte(1); pushByte(0);       // event
    pushByte(1); pushByte(1); pushByte(0);       // event_type

    // Data 2: event start
    pushByte(0x02);
    pushUint32(result.start_ts); pushByte(0); pushByte(0);

    // 4. Def 3: record (global 20) — includes exact A.fit cadence, fractional_cadence, cadence256, and running dynamics
    const numRecFields = withGps ? 13 : 11;
    pushByte(0x43); pushByte(0x00); pushByte(0x00); pushUint16(20); pushByte(numRecFields);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp: uint32
    pushByte(5); pushByte(4); pushByte(134);     // distance: uint32 (scale 100)
    pushByte(6); pushByte(2); pushByte(132);     // speed: uint16 (scale 1000)
    pushByte(3); pushByte(1); pushByte(2);       // heart_rate: uint8
    pushByte(4); pushByte(1); pushByte(2);       // cadence: uint8
    pushByte(53); pushByte(1); pushByte(2);      // fractional_cadence: uint8 (scale 128)
    pushByte(52); pushByte(2); pushByte(132);    // cadence256: uint16 (scale 256)
    pushByte(85); pushByte(2); pushByte(132);    // step_length: uint16 (scale 10, mm)
    pushByte(39); pushByte(2); pushByte(132);    // vertical_oscillation: uint16 (scale 10, mm)
    pushByte(83); pushByte(2); pushByte(132);    // vertical_ratio: uint16 (scale 100, %)
    pushByte(41); pushByte(2); pushByte(132);    // stance_time: uint16 (scale 10, ms)
    if (withGps) {
      pushByte(0); pushByte(4); pushByte(133);   // position_lat: sint32
      pushByte(1); pushByte(4); pushByte(133);   // position_long: sint32
    }

    // Data 3: records
    for (let i = 0; i < result.records.length; i++) {
      const r = result.records[i];
      const hasCad = (r.cadence !== null && r.cadence !== undefined);
      const cadByte = hasCad ? Math.round(r.cadence) : 255;
      const fracCadByte = (r.raw_fractional_cadence !== undefined && r.raw_fractional_cadence !== null) ? r.raw_fractional_cadence : 255;
      const cad256U16 = (r.raw_cadence256 !== undefined && r.raw_cadence256 !== null)
        ? r.raw_cadence256
        : (hasCad ? Math.round(r.cadence * 256) : 65535);
      const stepU16 = (r.raw_step_length !== undefined && r.raw_step_length !== null) ? r.raw_step_length : 65535;
      const voU16 = (r.raw_vertical_oscillation !== undefined && r.raw_vertical_oscillation !== null) ? r.raw_vertical_oscillation : 65535;
      const vrU16 = (r.raw_vertical_ratio !== undefined && r.raw_vertical_ratio !== null) ? r.raw_vertical_ratio : 65535;
      const stU16 = (r.raw_stance_time !== undefined && r.raw_stance_time !== null) ? r.raw_stance_time : 65535;

      pushByte(0x03);
      pushUint32(r.timestamp);
      pushUint32(Math.round(r.calc_distance * 100));
      pushUint16(Math.round(r.calc_speed * 1000));
      pushByte(r.heart_rate !== null && r.heart_rate !== undefined ? r.heart_rate : 255);
      pushByte(cadByte);
      pushByte(fracCadByte);
      pushUint16(cad256U16);
      pushUint16(stepU16);
      pushUint16(voU16);
      pushUint16(vrU16);
      pushUint16(stU16);
      if (withGps) {
        pushInt32(r.semilat);
        pushInt32(r.semilon);
      }
    }

    // 5. Def 4: lap (global 19)
    pushByte(0x44); pushByte(0x00); pushByte(0x00); pushUint16(19); pushByte(15);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp
    pushByte(2); pushByte(4); pushByte(134);     // start_time
    pushByte(7); pushByte(4); pushByte(134);     // total_elapsed_time (scale 1000)
    pushByte(8); pushByte(4); pushByte(134);     // total_timer_time (scale 1000)
    pushByte(9); pushByte(4); pushByte(134);     // total_distance (scale 100)
    pushByte(13); pushByte(2); pushByte(132);    // avg_speed (scale 1000)
    pushByte(14); pushByte(2); pushByte(132);    // max_speed (scale 1000)
    pushByte(11); pushByte(2); pushByte(132);    // total_calories
    pushByte(15); pushByte(1); pushByte(2);      // avg_heart_rate
    pushByte(16); pushByte(1); pushByte(2);      // max_heart_rate
    pushByte(17); pushByte(1); pushByte(2);      // avg_cadence
    pushByte(18); pushByte(1); pushByte(2);      // max_cadence
    pushByte(80); pushByte(1); pushByte(2);      // avg_fractional_cadence
    pushByte(120); pushByte(2); pushByte(132);   // avg_step_length
    pushByte(254); pushByte(2); pushByte(132);   // message_index

    // Data 4: laps
    for (let i = 0; i < result.laps.length; i++) {
      const l = result.laps[i];
      const lapEnd = l.start_time + l.duration_sec;
      pushByte(0x04);
      pushUint32(lapEnd);
      pushUint32(l.start_time);
      pushUint32(l.duration_sec * 1000);
      pushUint32(l.duration_sec * 1000);
      pushUint32(Math.round(l.distance_m * 100));
      pushUint16(Math.round((l.speed_kmh / 3.6) * 1000));
      pushUint16(Math.round((l.speed_kmh / 3.6) * 1000));
      pushUint16(l.calories);
      pushByte(l.avg_hr);
      pushByte(l.max_hr);
      pushByte(l.avg_cadence !== null && l.avg_cadence !== undefined ? l.avg_cadence : 255);
      pushByte(l.max_cadence !== null && l.max_cadence !== undefined ? l.max_cadence : 255);
      pushByte(l.raw_avg_fractional_cadence !== undefined ? l.raw_avg_fractional_cadence : 255);
      pushUint16(l.raw_avg_step_length !== undefined ? l.raw_avg_step_length : 65535);
      pushUint16(l.lap_index);
    }

    // 6. Def 5: session (global 18) — includes A.fit session cadence, strides, HR, calories, and running dynamics
    const totalSec = result.total_time_sec;
    const sessionEnd = result.start_ts + totalSec;
    const avgSpd = result.total_distance_m / totalSec;
    const sess = result.session || {};

    pushByte(0x45); pushByte(0x00); pushByte(0x00); pushUint16(18); pushByte(21);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp
    pushByte(2); pushByte(4); pushByte(134);     // start_time
    pushByte(7); pushByte(4); pushByte(134);     // total_elapsed_time
    pushByte(8); pushByte(4); pushByte(134);     // total_timer_time
    pushByte(9); pushByte(4); pushByte(134);     // total_distance
    pushByte(10); pushByte(4); pushByte(134);    // total_cycles (strides)
    pushByte(11); pushByte(2); pushByte(132);    // total_calories
    pushByte(14); pushByte(2); pushByte(132);    // avg_speed
    pushByte(15); pushByte(2); pushByte(132);    // max_speed
    pushByte(16); pushByte(1); pushByte(2);      // avg_heart_rate
    pushByte(17); pushByte(1); pushByte(2);      // max_heart_rate
    pushByte(18); pushByte(1); pushByte(2);      // avg_cadence
    pushByte(19); pushByte(1); pushByte(2);      // max_cadence
    pushByte(92); pushByte(1); pushByte(2);      // avg_fractional_cadence
    pushByte(134); pushByte(2); pushByte(132);   // avg_step_length
    pushByte(89); pushByte(2); pushByte(132);    // avg_vertical_oscillation
    pushByte(91); pushByte(2); pushByte(132);    // avg_stance_time
    pushByte(132); pushByte(2); pushByte(132);   // avg_vertical_ratio
    pushByte(25); pushByte(2); pushByte(132);    // first_lap_index
    pushByte(26); pushByte(2); pushByte(132);    // num_laps
    pushByte(5); pushByte(1); pushByte(0);       // sport (1 = running)

    // Data 5: session
    pushByte(0x05);
    pushUint32(sessionEnd);
    pushUint32(result.start_ts);
    pushUint32(totalSec * 1000);
    pushUint32(totalSec * 1000);
    pushUint32(Math.round(result.total_distance_m * 100));
    pushUint32(sess.total_cycles !== undefined ? sess.total_cycles : 4294967295);
    pushUint16(sess.total_calories !== undefined ? sess.total_calories : 600);
    pushUint16(Math.round(avgSpd * 1000));
    pushUint16(Math.round((result.max_speed_kmh / 3.6) * 1000));
    pushByte(sess.avg_heart_rate !== undefined ? sess.avg_heart_rate : 140);
    pushByte(sess.max_heart_rate !== undefined ? sess.max_heart_rate : 155);
    pushByte(sess.avg_cadence !== undefined ? sess.avg_cadence : 255);
    pushByte(sess.max_cadence !== undefined ? sess.max_cadence : 255);
    pushByte(sess.raw_avg_fractional_cadence !== undefined ? sess.raw_avg_fractional_cadence : 255);
    pushUint16(sess.raw_avg_step_length !== undefined ? sess.raw_avg_step_length : 65535);
    pushUint16(sess.raw_avg_vertical_oscillation !== undefined ? sess.raw_avg_vertical_oscillation : 65535);
    pushUint16(sess.raw_avg_stance_time !== undefined ? sess.raw_avg_stance_time : 65535);
    pushUint16(sess.raw_avg_vertical_ratio !== undefined ? sess.raw_avg_vertical_ratio : 65535);
    pushUint16(0); // first_lap_index: 0
    pushUint16(result.laps.length); // num_laps
    pushByte(1); // Running

    // 7. Def 6: activity (global 34)
    pushByte(0x46); pushByte(0x00); pushByte(0x00); pushUint16(34); pushByte(3);
    pushByte(253); pushByte(4); pushByte(134);   // timestamp
    pushByte(0); pushByte(4); pushByte(134);     // total_timer_time
    pushByte(1); pushByte(2); pushByte(132);     // num_sessions

    // Data 6: activity
    pushByte(0x06);
    pushUint32(sessionEnd);
    pushUint32(totalSec * 1000);
    pushUint16(1);

    // --- Header Construction ---
    const bodyArray = new Uint8Array(bodyBytes);
    const dataSize = bodyArray.length;

    const header = new Uint8Array(14);
    header[0] = 14;      // Header size
    header[1] = 0x20;    // Protocol 2.0
    header[2] = 0x8D;    // Profile 21.141
    header[3] = 0x08;
    header[4] = dataSize & 0xFF;
    header[5] = (dataSize >> 8) & 0xFF;
    header[6] = (dataSize >> 16) & 0xFF;
    header[7] = (dataSize >> 24) & 0xFF;
    header[8] = 0x2E;    // '.'
    header[9] = 0x46;    // 'F'
    header[10] = 0x49;   // 'I'
    header[11] = 0x54;   // 'T'

    // Compute Header CRC
    const headerCrc = computeCrc(header, 0, 12);
    header[12] = headerCrc & 0xFF;
    header[13] = (headerCrc >> 8) & 0xFF;

    // Allocate complete file buffer
    const fullBuffer = new Uint8Array(14 + dataSize + 2);
    fullBuffer.set(header, 0);
    fullBuffer.set(bodyArray, 14);

    // Compute File CRC (over header + body)
    const fileCrc = computeCrc(fullBuffer, 0, 14 + dataSize);
    fullBuffer[14 + dataSize] = fileCrc & 0xFF;
    fullBuffer[14 + dataSize + 1] = (fileCrc >> 8) & 0xFF;

    return fullBuffer.buffer;
  }

  // --- Public Interface ---
  return {
    kmhToMs,
    msToKmh,
    kmhToPaceStr,
    paceStrToKmh,
    formatDuration,
    getTrackCoords,
    decodeFitBinary,
    detectSpeedPhases,
    analyzeSync,
    buildWorkoutPlan,
    processWorkout,
    buildTCX,
    buildGPX,
    buildFitCSV,
    buildBinaryFIT
  };
});
