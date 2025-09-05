import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// ===== CONFIGURATION =====
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

const CONFIG = {
    API_URL: (import.meta.env.PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, ''),
    VIDEO_CONSTRAINTS: {
        high: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        fallback: { video: true }
    },
    MEDIAPIPE: {
        WASM_URL: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
        MODEL_URL: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    },
    DETECTION: {
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    },
    DRAWING: {
        lineWidth: 8,
        landmarkRadius: 8,
        landmarkColor: 'white'
    }
};

// ===== STATE =====
let video, overlay, ctx, offscreen, landmarker, latestLandmarks;
let showLandmarks = true;

// ===== CORE PROCESSING =====
/**
 * Initialize webcam, model, and canvases
 */
const enableVideoProcessing = async (videoId = 'webcam', overlayId = 'overlay') => {
    // Initialize DOM elements
    video = document.getElementById(videoId);
    overlay = document.getElementById(overlayId);
    ctx = overlay.getContext('2d');
    offscreen = document.createElement('canvas');

    // Setup webcam with fallback
    await setupWebcam();

    // Match canvas sizes to video
    setupCanvases();

    // Initialize MediaPipe model
    await initializeHandLandmarker();

    // Start processing loop
    requestAnimationFrame(processFrame);
};

const setupWebcam = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: CONFIG.VIDEO_CONSTRAINTS.high
        });
        video.srcObject = stream;
        await new Promise((resolve) => (video.onloadedmetadata = resolve));
    } catch {
        const stream = await navigator.mediaDevices.getUserMedia(CONFIG.VIDEO_CONSTRAINTS.fallback);
        video.srcObject = stream;
        await new Promise((resolve) => (video.onloadedmetadata = resolve));
    }
};

const setupCanvases = () => {
    overlay.width = offscreen.width = video.videoWidth;
    overlay.height = offscreen.height = video.videoHeight;
};

const initializeHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(CONFIG.MEDIAPIPE.WASM_URL);
    landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: CONFIG.MEDIAPIPE.MODEL_URL,
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        ...CONFIG.DETECTION
    });
};

/**
 * Main processing loop: detect landmarks and draw color-coded skeleton if enabled
 */
const processFrame = (timestamp) => {
    const result = landmarker.detectForVideo(video, timestamp);
    latestLandmarks = result.landmarks || [];

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (showLandmarks) {
        drawHandLandmarks();
    }

    requestAnimationFrame(processFrame);
};

const drawHandLandmarks = () => {
    latestLandmarks.forEach((hand) => {
        // Draw finger connections with color coding
        drawFingerConnections(hand);

        // Draw landmark points
        drawLandmarkPoints(hand);
    });
};

const drawFingerConnections = (hand) => {
    ctx.lineWidth = CONFIG.DRAWING.lineWidth;

    for (const finger in FINGER_CONNECTIONS) {
        const connections = FINGER_CONNECTIONS[finger];
        const [r, g, b] = FINGER_COLORS[finger];
        ctx.strokeStyle = `rgb(${r},${g},${b})`;

        connections.forEach(([start, end]) => {
            const p1 = hand[start];
            const p2 = hand[end];
            ctx.beginPath();
            ctx.moveTo(p1.x * overlay.width, p1.y * overlay.height);
            ctx.lineTo(p2.x * overlay.width, p2.y * overlay.height);
            ctx.stroke();
        });
    }
};

const drawLandmarkPoints = (hand) => {
    ctx.fillStyle = CONFIG.DRAWING.landmarkColor;

    hand.forEach(({ x, y }) => {
        ctx.beginPath();
        ctx.arc(
            x * overlay.width,
            y * overlay.height,
            CONFIG.DRAWING.landmarkRadius,
            0,
            2 * Math.PI
        );
        ctx.fill();
    });
};

// ===== UI INTERACTIONS =====
/**
 * Enable landmark preview toggle functionality
 */
const enablePreviewToggle = (buttonId = 'togglePreviewBtn') => {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const labelSpan = btn.querySelector('.label');
    if (!labelSpan) return;

    // Initialize button label
    updateToggleButtonLabel(labelSpan);

    // Add click handler
    btn.addEventListener('click', () => {
        showLandmarks = !showLandmarks;
        updateToggleButtonLabel(labelSpan);

        if (!showLandmarks) {
            ctx.clearRect(0, 0, overlay.width, overlay.height);
        }
    });
};

const updateToggleButtonLabel = (labelSpan) => {
    labelSpan.textContent = showLandmarks ? 'Hide Landmarks' : 'Show Landmarks';
};

/**
 * Enable snapshot capture functionality
 */
const captureSnapshot = (buttonId = 'captureBtn') => {
    document.getElementById(buttonId).addEventListener('click', async () => {
        const letter = getSelectedLetter();
        if (!letter) {
            alert('Please select a letter before capturing.');
            return;
        }

        try {
            const blob = await captureVideoFrame();
            const response = await sendImageToServer(blob, letter);
            const detectionResult = await processServerResponse(response);
            updateResultsUI(detectionResult);
        } catch (err) {
            console.error('Error during capture:', err.message);
        }
    });
};

// ===== UTILITIES =====
const getSelectedLetter = () => {
    const selected = document.querySelector('input[name="letter"]:checked');
    return selected?.value || null;
};

const captureVideoFrame = () => {
    return new Promise((resolve) => {
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(video, 0, 0);
        offscreen.toBlob(resolve, 'image/png');
    });
};

const sendImageToServer = async (blob, letter) => {
    const endpoint = `${CONFIG.API_URL}/process/`;
    const formData = new FormData();
    formData.append('image', blob, `${letter}_${crypto.randomUUID().split('-')[0]}.png`);
    formData.append('label', letter);

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        await handleServerError(response);
    }

    return response;
};

const handleServerError = async (response) => {
    let errorDetail = `HTTP ${response.status}`;

    try {
        const payload = await response.json();
        errorDetail += `: ${payload.detail ?? JSON.stringify(payload)}`;
    } catch {
        const text = await response.text();
        errorDetail += `: ${text}`;
    }

    throw new Error(errorDetail);
};

const processServerResponse = async (response) => {
    const record = await response.json();
    console.log('✅ Detected hands—metadata:', record);

    return extractDetectionData(record);
};

const extractDetectionData = (record) => {
    const detectedLetter = record.detected_as ?? record.predicted_as ?? '-';
    const confidenceNum = Number(record.confidence ?? 0);

    const handRaw = record?.metadata?.handedness?.[0] ??
        (record?.metadata?.landmarks?.right?.length ? 'right' :
            record?.metadata?.landmarks?.left?.length ? 'left' : null);

    const handDetected = handRaw
        ? handRaw.charAt(0).toUpperCase() + handRaw.slice(1)
        : '—';

    const confidencePct = `${Math.round(confidenceNum * 100)}%`;

    return {
        detectedLetter,
        confidenceNum,
        confidencePct,
        handDetected
    };
};

const updateResultsUI = (result) => {
    const { detectedLetter, confidenceNum, confidencePct, handDetected } = result;

    // Store in global state for other modules
    window.MSL_STATE = {
        lastDetectedLetter: detectedLetter,
        lastConfidenceNum: confidenceNum,
        lastConfidencePct: confidencePct,
        lastHand: handDetected,
    };

    // Update UI elements if they exist
    const elements = {
        letter: document.getElementById('resultLetter'),
        confidence: document.getElementById('resultConfidence'),
        hand: document.getElementById('resultHand')
    };

    if (elements.letter) elements.letter.textContent = `Letter detected: ${detectedLetter}`;
    if (elements.confidence) elements.confidence.textContent = `Confidence: ${confidencePct}`;
    if (elements.hand) elements.hand.textContent = `Hand detected: ${handDetected}`;
};

// ===== EXPORTS =====
export {
    enableVideoProcessing,
    enablePreviewToggle,
    captureSnapshot
};