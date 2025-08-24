let isPaused = false;

document.getElementById("startBtn").addEventListener("click", () => {
  startAudio().catch((err) =>
    alert("Microphone access denied or error: " + err)
  );
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("pauseBtn").style.display = "inline-block";
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  isPaused = !isPaused;
  document.getElementById("pauseBtn").innerText = isPaused ? "Resume" : "Pause";
});

async function startAudio() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();

  analyser.fftSize = 2048;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -30;
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
    const dbRange = maxDb - minDb; // Should be 70 if -100 to -30
    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.beginPath();
    ctx.strokeStyle = "#ccc";

    const labelSteps = 5;
    for (let i = 0; i <= labelSteps; i++) {
      // Normalized value: 0–1
      const norm = i / labelSteps;

      // Y-position on canvas (top = loudest, bottom = quietest)
      const y = canvasHeight - norm * canvasHeight;

      // Actual dBFS value at this step
      const dbValue = minDb + norm * dbRange;

      // Convert to positive display dB (e.g., 0–100 dB)
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

    // Draw X-axis line
    ctx.beginPath();
    ctx.moveTo(marginLeft, canvasHeight - 1);
    ctx.lineTo(canvasWidth, canvasHeight - 1);
    ctx.strokeStyle = "#ccc";
    ctx.stroke();

    // Determine frequency interval based on maxHz
    let freqInterval;
    if (maxHz === 20000) {
      freqInterval = 1000; // full spectrum
    } else if (maxHz === 10000) {
      freqInterval = 1000; // high frequencies
    } else {
      freqInterval = 100; // low and mid frequencies
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

    // Draw the spectrum line
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

  function draw() {
    requestAnimationFrame(draw);
    if (isPaused) return;

    analyser.getByteTimeDomainData(timeArray);

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

    // Draw frequency spectrums
    drawSpectrumGraph(ctxs[1], 20, 20000); // Full spectrum
    drawSpectrumGraph(ctxs[2], 20, 1000); // Low frequencies
    drawSpectrumGraph(ctxs[3], 1000, 3000); // Mid frequencies
    drawSpectrumGraph(ctxs[4], 3000, 10000); // High frequencies
  }

  draw();
}
