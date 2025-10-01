🎧 Real-Time Audio Spectrum Analyzer & Data Logger
This application utilizes the Web Audio API to capture microphone input, perform real-time frequency analysis, and automatically log audio events above a defined threshold. It supports both live visualization and offline analysis of recorded data.

🚀 Key Features
Live Analysis
📈 Real-time waveform display.

🎚 Frequency spectrums across four ranges: Full (20Hz–20kHz), Low (20Hz–1kHz), Mid (1kHz–3kHz), and High (3kHz–10kHz).

⏸ Pause/Resume functionality to temporarily freeze the live stream.

Data Capture & Storage
💾 Automated Snapshot Recording: Captures frequency-volume data (spectrum) only when the input volume exceeds a defined threshold (currently -40 dB).

⏱ Cooldown Period: Enforces a minimum time delay (1000ms) between captures to avoid recording redundant data from a single loud event.

📥 JSON Export: After stopping the recording, all captured snapshots are compiled and downloaded as a peak_snapshots_timestamp.json file.

Offline Visualization
📂 Load Data: Users can upload a previously saved *.json file.

🔄 Iterative Playback: The "Visualize" button cycles through all snapshots loaded from the file, allowing frame-by-frame analysis of recorded sound events.

🔧 How to Use
A. Setup and Live Visualization
Clone or download the repository.

Open the HTML file in a web browser.

Click "Start Audio" to initialize the Audio Context and allow microphone access.

Watch the waveform and spectrums update in real-time.

B. Recording Snapshots
Ensure live audio is running ("Start Audio" has been pressed).

Click "Record". The button turns red to indicate active logging.

Speak or generate the sound you wish to capture.

Click "Stop & Process". A JSON file containing all captured peak snapshots will automatically download.

C. Visualizing Recorded Files
Click "Choose File" and upload the *.json file you previously recorded.

Click "Visualize".

Each subsequent click of the "Visualize" button will load the next snapshot in the file, cycling back to the beginning when the end is reached. The snapshot index and peak dB value are displayed in the info area.

🔐 Privacy Notice: This app requires microphone access. All audio processing and data recording occur locally within your browser. No audio data is sent over the network.
