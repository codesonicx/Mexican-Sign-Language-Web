// public/scripts/video-processor.js
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Finger connection indices and colors, matching MediaPipe's Python defaults
const FINGER_CONNECTIONS = {
    thumb: [[0, 1], [1, 2], [2, 3], [3, 4]],
    index: [[5, 6], [6, 7], [7, 8]],
    middle: [[9, 10], [10, 11], [11, 12]],
    ring: [[13, 14], [14, 15], [15, 16]],
    pinky: [[17, 18], [18, 19], [19, 20]],
    palm: [[0, 5], [5, 9], [9, 13], [13, 17], [0, 17]]
};

const FINGER_COLORS = {
    thumb: [255, 0, 0],   // red
    index: [0, 255, 0],   // green
    middle: [0, 0, 255],  // blue
    ring: [255, 255, 0],   // yellow
    pinky: [255, 0, 255],  // magenta
    palm: [200, 200, 200]  // light gray
};

let video, overlay, ctx, offscreen, landmarker, latestLandmarks;
let showLandmarks = true;

/**
 * Initialize webcam, model, and canvases
 */
const enableVideoProcessing = async (
    videoId = 'webcam',
    overlayId = 'overlay'
) => {
    video = document.getElementById(videoId);
    overlay = document.getElementById(overlayId);
    ctx = overlay.getContext('2d');
    offscreen = document.createElement('canvas');

    // Setup webcam at highest available resolution
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = stream;
        await new Promise((r) => (video.onloadedmetadata = r));
    } catch {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await new Promise((r) => (video.onloadedmetadata = r));
    }

    // Match overlay and offscreen canvas size to video
    overlay.width = offscreen.width = video.videoWidth;
    overlay.height = offscreen.height = video.videoHeight;



    // Initialize MediaPipe HandLandmarker in VIDEO mode
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    requestAnimationFrame(processFrame);
};

/**
 * Toggle landmark preview on/off
 */
const enablePreviewToggle = (
    buttonId = 'togglePreviewBtn'
) => {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    // Find the label span inside the button
    const labelSpan = btn.querySelector('.label');
    if (!labelSpan) return;
    // Initialize label based on current state
    labelSpan.textContent = showLandmarks ? 'Hide Landmarks' : 'Show Landmarks';
    btn.addEventListener('click', () => {
        showLandmarks = !showLandmarks;
        // Update only the label text, keep the icon slot intact
        labelSpan.textContent = showLandmarks ? 'Hide Landmarks' : 'Show Landmarks';
        if (!showLandmarks) {
            ctx.clearRect(0, 0, overlay.width, overlay.height);
        }
    });
};

/**
 * Main loop: detect landmarks and draw color-coded skeleton if enabled
 */
const processFrame = (timestamp) => {
    const result = landmarker.detectForVideo(video, timestamp);
    latestLandmarks = result.landmarks || [];

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (showLandmarks) {
        latestLandmarks.forEach((hand) => {
            // Draw each finger with its color
            for (const finger in FINGER_CONNECTIONS) {
                const connections = FINGER_CONNECTIONS[finger];
                const [r, g, b] = FINGER_COLORS[finger];
                ctx.strokeStyle = `rgb(${r},${g},${b})`;
                ctx.lineWidth = 8;
                connections.forEach(([start, end]) => {
                    const p1 = hand[start];
                    const p2 = hand[end];
                    ctx.beginPath();
                    ctx.moveTo(
                        p1.x * overlay.width,
                        p1.y * overlay.height
                    );
                    ctx.lineTo(
                        p2.x * overlay.width,
                        p2.y * overlay.height
                    );
                    ctx.stroke();
                });
            }
            // Draw the landmark circles in white
            ctx.fillStyle = 'white';
            hand.forEach(({ x, y }) => {
                ctx.beginPath();
                ctx.arc(
                    x * overlay.width,
                    y * overlay.height,
                    8,
                    0,
                    2 * Math.PI
                );
                ctx.fill();
            });
        });
    }
    requestAnimationFrame(processFrame);
};

/**
 * Capture a snapshot of the current video frame and send it to the server
 */

const RAW_API = import.meta.env.PUBLIC_API_URL || 'http://127.0.0.1:8000'
const API_URL = RAW_API.replace(/\/$/, '')

const captureSnapshot = (buttonId = 'captureBtn') => {
    document.getElementById(buttonId).addEventListener('click', async () => {
        // Get the selected letter from radio buttons
        const selected = document.querySelector('input[name="letter"]:checked');
        if (!selected) {
            return alert('Please select a letter before capturing.');
        }
        const letter = selected.value;

        // Capture the frame in the hidden canvas
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(video, 0, 0);

        // Convert the canvas to a blob and send it
        offscreen.toBlob(async (blob) => {
            try {
                const endpoint = `${API_URL}/process/`
                const form = new FormData();
                form.append('image', blob, `${letter}_${crypto.randomUUID().split('-')[0]}.png`);
                form.append('label', letter);
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    body: form
                });

                // If the status is NOT 2xx, grab the JSON error payload
                if (!resp.ok) {
                    let errDetail = `HTTP ${resp.status}`;
                    try {
                        const payload = await resp.json();
                        errDetail += `: ${payload.detail ?? JSON.stringify(payload)}`;
                    } catch {
                        const text = await resp.text();
                        errDetail += `: ${text}`;
                    }
                    throw new Error(errDetail);
                }

                const record = await resp.json();
                console.log('✅ Detected hands—metadata:', record);

                // ---- extraer campos principales ----
                const detectedLetter = record.detected_as ?? record.predicted_as ?? '-';
                const confidenceNum = Number(record.confidence ?? 0);              // 0..1
                const handRaw =
                    record?.metadata?.handedness?.[0] ??
                    (record?.metadata?.landmarks?.right?.length ? 'right' :
                        record?.metadata?.landmarks?.left?.length ? 'left' : null);

                const handDetected = handRaw
                    ? handRaw.charAt(0).toUpperCase() + handRaw.slice(1)   // Left/Right
                    : '—';

                const confidencePct = `${Math.round(confidenceNum * 100)}%`;

                // ---- guarda en un “estado” global simple (por si lo necesitas en otros módulos) ----
                window.MSL_STATE = {
                    lastDetectedLetter: detectedLetter,
                    lastConfidenceNum: confidenceNum,
                    lastConfidencePct: confidencePct,
                    lastHand: handDetected,
                };

                // ---- actualiza la UI de Results (si existe) ----
                const $letter = document.getElementById('resultLetter');
                const $conf = document.getElementById('resultConfidence');
                const $hand = document.getElementById('resultHand');

                if ($letter) $letter.textContent = "Letter detected: " + detectedLetter;
                if ($conf) $conf.textContent = "Confidence: " + confidencePct;
                if ($hand) $hand.textContent = "Hand detected: " + handDetected;
            }
            catch (err) {
                console.error('Error sending:', err.message);
            }
        }, 'image/png');
    });
};

export {
    enableVideoProcessing,
    enablePreviewToggle,
    captureSnapshot
};