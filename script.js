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
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const timeArray = new Uint8Array(bufferLength);

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

  function drawYAxis(ctx) {
    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.beginPath();
    ctx.strokeStyle = "#ccc";

    const steps = [255, 192, 128, 64, 0];
    steps.forEach((value) => {
      const y = canvasHeight - (value / 255) * canvasHeight;
      ctx.fillText(value.toString(), marginLeft - 5, y);
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(canvasWidth, y);
    });

    ctx.stroke();
  }

  function draw() {
    requestAnimationFrame(draw);
    if (isPaused) return;

    analyser.getByteTimeDomainData(timeArray);
    analyser.getByteFrequencyData(dataArray);

    // Waveform (no Y-axis for waveform)
    const ctx = ctxs[0];
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.beginPath();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    
    // Start from the first point
    ctx.moveTo(0, canvasHeight - (timeArray[0] / 255) * canvasHeight);
    
    for (let i = 1; i < timeArray.length; i++) {
      const x = (i * canvasWidth) / timeArray.length;
      const y = canvasHeight - (timeArray[i] / 255) * canvasHeight;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // FFT spectrum drawing
    function drawSpectrum(ctx, minHz, maxHz) {
      const minIndex = Math.floor(
        (minHz / (audioCtx.sampleRate / 2)) * bufferLength
      );
      const maxIndex = Math.floor(
        (maxHz / (audioCtx.sampleRate / 2)) * bufferLength
      );

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawYAxis(ctx);

      ctx.beginPath();
      ctx.strokeStyle = "#000";
      for (let i = minIndex; i < maxIndex; i++) {
        const x =
          marginLeft +
          ((i - minIndex) * (canvasWidth - marginLeft)) / (maxIndex - minIndex);
        const y = canvasHeight - (dataArray[i] / 255) * canvasHeight;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawSpectrum(ctxs[1], 20, 20000); // Full spectrum
    drawSpectrum(ctxs[2], 20, 1000); // Low frequencies
    drawSpectrum(ctxs[3], 1000, 3000); // Mid frequencies
    drawSpectrum(ctxs[4], 3000, 10000); // High frequencies
  }

  draw();
}
