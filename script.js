/* =======================================================
 * GLOBAL STATE VARIABLES
 * These variables control the application's overall status
 * and data across all functions.
 * ======================================================= */
let isPaused = false;
let isRecording = false;
let recordedSnapshots = [];
const SNAPSHOT_PEAK_THRESHOLD = -95; // dB value: Snapshot is captured if peak is >= this threshold (e.g., -40 dB).
let lastSnapshotTime = 0;
const MIN_TIME_BETWEEN_SNAPSHOTS = 1000; // ms: Minimum time gap required between two consecutive snapshots.

// Audio Context and Analyser
let audioCtx;
let analyser;
let bufferLength; // Analyser's frequency bin count (e.g., 1024) - used for array size.

// Canvas and Visualization
let ctxs = []; // Array to hold the 2D rendering contexts for all canvases.
let canvasWidth = window.innerWidth;
let canvasHeight = 120;
let marginLeft = 40; // Margin for Y-axis labels.

// Snapshot Loading and Visualization Tracker
let loadedSnapshots = [];
let currentSnapshotIndex = 0; // Index of the snapshot currently displayed (used by visualizeBtn).
// (Removed: let prevPeakDb = -Infinity; - Was unused)

/* =======================================================
 * FILE HANDLING AND VISUALIZATION LOGIC
 * ======================================================= */

document.getElementById("snapshotFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  const visualizeBtn = document.getElementById("visualizeBtn");
  const snapshotInfo = document.getElementById("snapshotInfo");

  if (!file) {
    visualizeBtn.disabled = true;
    snapshotInfo.innerText = "No file selected.";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.snapshots && data.snapshots.length > 0) {
        loadedSnapshots = data.snapshots;
        currentSnapshotIndex = 0; // Reset index to start at the first snapshot
        visualizeBtn.disabled = false;
        snapshotInfo.innerText = `Loaded ${loadedSnapshots.length} snapshots. Ready to visualize.`;
      } else {
        alert("JSON file does not contain valid snapshot data.");
        visualizeBtn.disabled = true;
        snapshotInfo.innerText = "Error: Invalid snapshot data.";
      }
    } catch (err) {
      alert("Error parsing JSON file: " + err);
      visualizeBtn.disabled = true;
      snapshotInfo.innerText = "Error: Invalid JSON file.";
    }
  };
  reader.readAsText(file);
});

document.getElementById("visualizeBtn").addEventListener("click", () => {
  // Pre-checks
  if (loadedSnapshots.length === 0 || ctxs.length === 0) {
    alert(
      "Please load a valid JSON file and ensure the canvases are available (Start Audio first)."
    );
    return;
  } // 1. Get the current snapshot using the global index

  const currentSnapshot = loadedSnapshots[currentSnapshotIndex];
  const frequencyDataArray = currentSnapshot.data; // Convert standard Array to Float32Array for consistent drawing function input

  const floatDataArrayToDraw = new Float32Array(frequencyDataArray); // Call the drawing function for all spectrum canvases

  drawSpectrumGraph(ctxs[1], 20, 20000, floatDataArrayToDraw);
  drawSpectrumGraph(ctxs[2], 20, 1000, floatDataArrayToDraw);
  drawSpectrumGraph(ctxs[3], 1000, 3000, floatDataArrayToDraw);
  drawSpectrumGraph(ctxs[4], 3000, 10000, floatDataArrayToDraw); // 2. Update the Info Display

  document.getElementById(
    "snapshotInfo"
  ).innerText = `Visualized Snapshot Index: ${currentSnapshotIndex} / ${
    loadedSnapshots.length - 1
  } at Peak: ${currentSnapshot.peakDb.toFixed(2)} dB`; // 3. Advance the Index (Circular Logic)

  currentSnapshotIndex++;
  if (currentSnapshotIndex >= loadedSnapshots.length) {
    currentSnapshotIndex = 0; // Loop back to the first snapshot
    document.getElementById(
      "snapshotInfo"
    ).innerText += `\n(Restarting visualization loop from Index 0)`;
  }
});

/* =======================================================
 * CONTROL BUTTONS
 * ======================================================= */

document.getElementById("startBtn").addEventListener("click", () => {
  startAudio().catch((err) =>
    alert("Microphone access denied or error: " + err)
  );
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("pauseBtn").style.display = "inline-block";
  isPaused = false;
  document.getElementById("pauseBtn").innerText = "Pause";
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  isPaused = !isPaused;

  if (isPaused) {
    document.getElementById("pauseBtn").innerText = "Resume";
  } else {
    // prevPeakDb is not used here anymore, simplifying the logic
    document.getElementById("pauseBtn").innerText = "Pause";
  }
});

document.getElementById("recordBtn").addEventListener("click", () => {
  isRecording = !isRecording;
  const recordBtn = document.getElementById("recordBtn");

  if (isRecording) {
    // Start Recording Mode
    recordedSnapshots = []; // Clear previous data
    recordBtn.innerText = "Stop & Process";
    recordBtn.style.backgroundColor = "red";
    recordBtn.style.color = "white"; // Ensure audio is running if it was paused
    if (isPaused) {
      document.getElementById("pauseBtn").click();
    }
  } else {
    // Stop Recording Mode & Process Data
    recordBtn.innerText = "Record";
    recordBtn.style.backgroundColor = "";
    recordBtn.style.color = "";

    processRecordedSnapshots(recordedSnapshots);
  }
});

/* =======================================================
 * DRAWING FUNCTIONS
 * ======================================================= */

function drawYAxis(ctx, minDb, maxDb) {
  const dbRange = maxDb - minDb;
  ctx.fillStyle = "#333";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.strokeStyle = "#ccc";

  const labelSteps = 5;
  for (let i = 0; i <= labelSteps; i++) {
    const norm = i / labelSteps;
    const y = canvasHeight - norm * canvasHeight; // We only display the range difference (0dB at the top, -100dB at the bottom)
    const displayDb = Math.round(minDb + norm * dbRange);

    ctx.fillText(displayDb + " dB", marginLeft - 5, y);
    ctx.moveTo(marginLeft, y);
    ctx.lineTo(canvasWidth, y);
  }

  ctx.stroke();
}

/**
 * Draws the spectrum graph using a provided Float32Array of data.
 * Works for both live analyser data and loaded snapshot data.
 * @param {CanvasRenderingContext2D} ctx - The canvas context to draw on.
 * @param {number} minHz - The lowest frequency to display.
 * @param {number} maxHz - The highest frequency to display.
 * @param {Float32Array} floatDataArrayToDraw - The frequency data (dB values) to plot.
 */
function drawSpectrumGraph(ctx, minHz, maxHz, floatDataArrayToDraw) {
  // Check if audioCtx is initialized (essential for sampleRate)
  if (!audioCtx) {
    console.error("Audio Context is not initialized. Cannot draw spectrum.");
    return;
  } // Check if data was passed (essential for visualization)

  if (!floatDataArrayToDraw) {
    console.error("drawSpectrumGraph was called without data.");
    return;
  }

  const sampleRate = audioCtx.sampleRate;
  const nyquist = sampleRate / 2;

  const dataArray = floatDataArrayToDraw;
  const usedBufferLength = dataArray.length; // Length is constant (analyser.frequencyBinCount, e.g., 1024) // Calculate the starting and ending indices within the data array

  const minIndex = Math.floor((minHz / nyquist) * usedBufferLength);
  const maxIndex = Math.floor((maxHz / nyquist) * usedBufferLength);

  const minDb = -100; // Analyser minDecibels
  const maxDb = 0; // Analyser maxDecibels
  const dbRange = maxDb - minDb;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawYAxis(ctx, minDb, maxDb); // 1. Draw X-Axis Line

  ctx.beginPath();
  ctx.moveTo(marginLeft, canvasHeight - 1);
  ctx.lineTo(canvasWidth, canvasHeight - 1);
  ctx.strokeStyle = "#ccc";
  ctx.stroke(); // 2. Draw Frequency Labels (X-Axis)

  let freqInterval;
  if (maxHz === 20000) {
    freqInterval = 1000; // 1kHz, 2kHz...
  } else if (maxHz === 10000) {
    freqInterval = 1000;
  } else {
    freqInterval = 100; // For lower ranges
  }

  ctx.fillStyle = "#000";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (
    let hz = Math.ceil(minHz / freqInterval) * freqInterval;
    hz <= maxHz;
    hz += freqInterval
  ) {
    const x =
      marginLeft +
      ((hz - minHz) / (maxHz - minHz)) * (canvasWidth - marginLeft);
    const label = hz >= 1000 ? hz / 1000 + "k" : hz.toString();
    ctx.fillText(label, x, canvasHeight - 12);
  } // 3. Draw the Spectrum Data

  ctx.beginPath();
  ctx.strokeStyle = "#007";
  ctx.lineWidth = 1;

  for (let i = minIndex; i <= maxIndex; i++) {
    // Calculate frequency based on the bin index (i) and the total buffer size
    const freq = (i / usedBufferLength) * nyquist; // Map frequency to X coordinate

    const x =
      marginLeft +
      ((freq - minHz) / (maxHz - minHz)) * (canvasWidth - marginLeft); // Map dB value to Y coordinate

    const db = dataArray[i];
    const y = canvasHeight - ((db - minDb) / dbRange) * canvasHeight;

    if (i === minIndex) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
}

/* =======================================================
 * DATA PROCESSING AND DOWNLOAD
 * ======================================================= */

function processRecordedSnapshots(snapshots) {
  if (snapshots.length === 0) {
    alert("No peaks recorded above the threshold.");
    return;
  } // Prepare data for JSON serialization

  const serializableSnapshots = snapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp,
    peakDb: snapshot.peakDb, // Convert Float32Array to regular Array for JSON compatibility
    data: Array.from(snapshot.data),
  }));

  const recordingObject = {
    meta: {
      snapshotCount: serializableSnapshots.length,
      thresholdDb: SNAPSHOT_PEAK_THRESHOLD,
      analyserFftSize: 2048,
    },
    snapshots: serializableSnapshots,
  };

  const json = JSON.stringify(recordingObject, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob); // Trigger file download

  const a = document.createElement("a");
  a.href = url;
  a.download = `peak_snapshots_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(
    `Successfully captured and downloaded ${snapshots.length} peak snapshots!`
  );
}

/* =======================================================
 * MAIN AUDIO INITIALIZATION AND LOOP
 * ======================================================= */

async function startAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser(); // Analyser Setup

  analyser.fftSize = 2048; // Determines frequency bin count
  analyser.minDecibels = -100;
  analyser.maxDecibels = 0;
  bufferLength = analyser.frequencyBinCount; // 1024 (half of fftSize)
  const timeArray = new Uint8Array(bufferLength); // For waveform
  const floatDataArray = new Float32Array(bufferLength); // For spectrum (local to startAudio)

  source.connect(analyser); // Canvas Setup (must happen after startAudio is called)

  const waveformCanvas = document.getElementById("waveform");
  const spectrumFull = document.getElementById("spectrum-full");
  const spectrumLow = document.getElementById("spectrum-low");
  const spectrumMid = document.getElementById("spectrum-mid");
  const spectrumHigh = document.getElementById("spectrum-high");

  canvasWidth = window.innerWidth;
  canvasHeight = 120;
  marginLeft = 40;

  const canvases = [
    waveformCanvas,
    spectrumFull,
    spectrumLow,
    spectrumMid,
    spectrumHigh,
  ];
  ctxs = canvases.map((c) => {
    c.width = canvasWidth;
    c.height = canvasHeight;
    return c.getContext("2d");
  });

  function draw() {
    requestAnimationFrame(draw);

    if (isPaused) return;

    analyser.getByteTimeDomainData(timeArray);
    analyser.getFloatFrequencyData(floatDataArray); // Read live frequency data

    if (isRecording) {
      // Peak detection and snapshot logic
      const currentPeakDb = Math.max(...floatDataArray);
      const now = Date.now();

      if (
        currentPeakDb >= SNAPSHOT_PEAK_THRESHOLD &&
        now - lastSnapshotTime > MIN_TIME_BETWEEN_SNAPSHOTS
      ) {
        console.log(
          `Peak hit at ${currentPeakDb.toFixed(2)} dB. Capturing snapshot.`
        );

        const frequencyDataCopy = new Float32Array(floatDataArray);

        const snapshot = {
          timestamp: new Date().toISOString(),
          peakDb: currentPeakDb,
          data: frequencyDataCopy,
        };

        recordedSnapshots.push(snapshot);
        lastSnapshotTime = now; // Reset the cooldown timer
      }
    }

    // Draw Waveform (ctxs[0])
    const ctxWaveform = ctxs[0];
    ctxWaveform.clearRect(0, 0, canvasWidth, canvasHeight);
    ctxWaveform.beginPath();
    ctxWaveform.strokeStyle = "#000";
    ctxWaveform.lineWidth = 2;

    ctxWaveform.moveTo(0, canvasHeight - (timeArray[0] / 255) * canvasHeight);
    for (let i = 1; i < timeArray.length; i++) {
      const x = (i * canvasWidth) / timeArray.length;
      const y = canvasHeight - (timeArray[i] / 255) * canvasHeight;
      ctxWaveform.lineTo(x, y);
    }
    ctxWaveform.stroke(); // Draw Spectrum (ctxs[1] to ctxs[4])

    drawSpectrumGraph(ctxs[1], 20, 20000, floatDataArray);
    drawSpectrumGraph(ctxs[2], 20, 1000, floatDataArray);
    drawSpectrumGraph(ctxs[3], 1000, 3000, floatDataArray);
    drawSpectrumGraph(ctxs[4], 3000, 10000, floatDataArray);
  }

  draw();
}
