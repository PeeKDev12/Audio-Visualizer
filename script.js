let isPaused = false;
let autoPauseEnabled = false;
let gracePeriodEnd = 0; // timestamp to ignore auto-pause after resume

document.getElementById("startBtn").addEventListener("click", () => {
  startAudio().catch((err) =>
    alert("Microphone access denied or error: " + err)
  );
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("pauseBtn").style.display = "inline-block";
  isPaused = false;
  autoPauseEnabled = true;
  gracePeriodEnd = 0;
  document.getElementById("pauseBtn").innerText = "Pause";
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  isPaused = !isPaused;

  if (isPaused) {
    // Manual pause disables auto pause & grace period
    autoPauseEnabled = false;
    gracePeriodEnd = 0;
    document.getElementById("pauseBtn").innerText = "Resume";
  } else {
    // Resume enables auto pause and sets grace period (2 sec)
    autoPauseEnabled = true;
    gracePeriodEnd = Date.now() + 800; // 0.8 seconds grace period
    prevPeakDb = -Infinity; // reset peak tracking
    prevPeakDbPositive = 0;
    document.getElementById("pauseBtn").innerText = "Pause";
  }
});

async function startAudio() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();

  analyser.fftSize = 2048;
  analyser.minDecibels = -100;
  analyser.maxDecibels = 0;
  const bufferLength = analyser.frequencyBinCount;
  const timeArray = new Uint8Array(bufferLength);
  const floatDataArray = new Float32Array(bufferLength);

  source.connect(analyser);

  const waveformCanvas = document.getElementById("waveform");
  const spectrumFull = document.getElementById("spectrum-full");
  const spectrumLow = document.getElementById("spectrum-low");
  const spectrumMid = document.getElementById("spectrum-mid");
  const spectrumHigh = document.getElementById("spectrum-high");

  const canvasWidth = window.innerWidth;
  const canvasHeight = 120;
  const marginLeft = 40;

  const canvases = [
    waveformCanvas,
    spectrumFull,
    spectrumLow,
    spectrumMid,
    spectrumHigh,
  ];
  const ctxs = canvases.map((c) => {
    c.width = canvasWidth;
    c.height = canvasHeight;
    return c.getContext("2d");
  });

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
      const y = canvasHeight - norm * canvasHeight;
      const dbValue = minDb + norm * dbRange;
      const displayDb = Math.round(dbValue - minDb);

      ctx.fillText(displayDb + " dB", marginLeft - 5, y);
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(canvasWidth, y);
    }

    ctx.stroke();
  }

  function drawSpectrumGraph(ctx, minHz, maxHz) {
    const sampleRate = audioCtx.sampleRate;
    const nyquist = sampleRate / 2;
    const minIndex = Math.floor((minHz / nyquist) * bufferLength);
    const maxIndex = Math.floor((maxHz / nyquist) * bufferLength);

    analyser.getFloatFrequencyData(floatDataArray);

    const minDb = analyser.minDecibels;
    const maxDb = analyser.maxDecibels;
    const dbRange = maxDb - minDb;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawYAxis(ctx, minDb, maxDb);

    ctx.beginPath();
    ctx.moveTo(marginLeft, canvasHeight - 1);
    ctx.lineTo(canvasWidth, canvasHeight - 1);
    ctx.strokeStyle = "#ccc";
    ctx.stroke();

    let freqInterval;
    if (maxHz === 20000) {
      freqInterval = 1000;
    } else if (maxHz === 10000) {
      freqInterval = 1000;
    } else {
      freqInterval = 100;
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
    }

    ctx.beginPath();
    ctx.strokeStyle = "#007";
    ctx.lineWidth = 1;

    for (let i = minIndex; i <= maxIndex; i++) {
      const freq = (i / bufferLength) * nyquist;
      const x =
        marginLeft +
        ((freq - minHz) / (maxHz - minHz)) * (canvasWidth - marginLeft);
      const db = floatDataArray[i];
      const y = canvasHeight - ((db - minDb) / dbRange) * canvasHeight;

      if (i === minIndex) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  let prevPeakDb = -Infinity;
  let prevPeakDbPositive = 0;

  function draw() {
    requestAnimationFrame(draw);

    if (isPaused) return;

    analyser.getByteTimeDomainData(timeArray);
    analyser.getFloatFrequencyData(floatDataArray);

    const minDb = analyser.minDecibels;
    const maxDb = analyser.maxDecibels;

    let peakDb = -Infinity;
    for (let i = 0; i < floatDataArray.length; i++) {
      if (floatDataArray[i] > peakDb) peakDb = floatDataArray[i];
    }

    const peakDbPositive = peakDb - minDb;
    const now = Date.now();

    if (autoPauseEnabled) {
      if (now > gracePeriodEnd) {
        if (peakDb >= maxDb) {
          isPaused = true;
          autoPauseEnabled = false;
          document.getElementById("pauseBtn").innerText = "Resume";
          return;
        }

        if (peakDb < prevPeakDb && prevPeakDbPositive >= 50) {
          isPaused = true;
          autoPauseEnabled = false;
          document.getElementById("pauseBtn").innerText = "Resume";
          return;
        }
      }
    }

    prevPeakDb = peakDb;
    prevPeakDbPositive = peakDbPositive;

    // Draw waveform
    const ctx = ctxs[0];
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.beginPath();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;

    ctx.moveTo(0, canvasHeight - (timeArray[0] / 255) * canvasHeight);
    for (let i = 1; i < timeArray.length; i++) {
      const x = (i * canvasWidth) / timeArray.length;
      const y = canvasHeight - (timeArray[i] / 255) * canvasHeight;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    drawSpectrumGraph(ctxs[1], 20, 20000);
    drawSpectrumGraph(ctxs[2], 20, 1000);
    drawSpectrumGraph(ctxs[3], 1000, 3000);
    drawSpectrumGraph(ctxs[4], 3000, 10000);
  }

  draw();
}
