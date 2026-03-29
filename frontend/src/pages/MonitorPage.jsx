import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/api';

const LANDMARKS = {
  forehead: 10,
  noseTip: 1,
  chin: 152,
  rightCheek: 234,
  leftCheek: 454,
};

function randomVitals(base) {
  const jitter = (value, range) => Math.round(value + (Math.random() - 0.5) * range);

  return {
    heartRate: jitter(base?.heartRate || 72, 6),
    breathingRate: jitter(base?.breathingRate || 16, 3),
    stressLevel: jitter(base?.stressLevel || 28, 10),
    hrv: jitter(base?.hrv || 55, 8),
    spo2: Math.min(100, jitter(base?.spo2 || 98, 2)),
  };
}

function hashVitals(vitals) {
  return Math.abs(JSON.stringify(vitals).split('').reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0)).toString(16);
}

function buildSessionId() {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MonitorPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const sessionIdRef = useRef(buildSessionId());
  const faceMeshRef = useRef(null);
  const cameraUtilRef = useRef(null);
  const latestVitalsRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [vitals, setVitals] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [logging, setLogging] = useState(false);
  const [txLog, setTxLog] = useState([]);
  const [presageStatus, setPresageStatus] = useState({
    provider: 'demo',
    ready: false,
    message: 'Checking Presage status...',
  });

  useEffect(() => {
    latestVitalsRef.current = vitals;
  }, [vitals]);

  const drawArOverlay = useCallback((ctx, landmarks, width, height) => {
    const currentVitals = latestVitalsRef.current;
    if (!currentVitals) {
      return;
    }

    const pointFor = (index) => ({
      x: (1 - landmarks[index].x) * width,
      y: landmarks[index].y * height,
    });

    const nose = pointFor(LANDMARKS.noseTip);
    const forehead = pointFor(LANDMARKS.forehead);
    const chin = pointFor(LANDMARKS.chin);
    const rightCheek = pointFor(LANDMARKS.rightCheek);
    const leftCheek = pointFor(LANDMARKS.leftCheek);

    const faceWidth = Math.abs(leftCheek.x - rightCheek.x);
    const faceHeight = Math.abs(chin.y - forehead.y);
    const offset = faceWidth * 0.72;

    const badges = [
      { label: 'HR', value: `${currentVitals.heartRate ?? '--'} bpm`, x: rightCheek.x + offset, y: forehead.y, color: '#ef4444', anchor: nose },
      { label: 'BR', value: `${currentVitals.breathingRate ?? '--'} br/m`, x: rightCheek.x + offset, y: nose.y, color: '#3b82f6', anchor: nose },
      { label: 'SpO2', value: `${currentVitals.spo2 ?? '--'}%`, x: leftCheek.x - offset, y: forehead.y, color: '#10b981', anchor: nose },
      { label: 'Stress', value: `${currentVitals.stressLevel ?? '--'}/100`, x: leftCheek.x - offset, y: nose.y, color: '#f59e0b', anchor: nose },
      { label: 'HRV', value: `${currentVitals.hrv ?? '--'} ms`, x: nose.x, y: chin.y + faceHeight * 0.38, color: '#8b5cf6', anchor: chin },
    ];

    badges.forEach(({ label, value, x, y, color, anchor }) => {
      ctx.beginPath();
      ctx.strokeStyle = `${color}44`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, y);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(6, 10, 18, 0.76)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const badgeWidth = 110;
      const badgeHeight = 36;
      ctx.beginPath();
      ctx.roundRect(x - badgeWidth / 2, y - badgeHeight / 2, badgeWidth, badgeHeight, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(label, x, y - 5);

      ctx.fillStyle = color;
      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(value, x, y + 10);
    });

    const time = Date.now() / 1000;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = time * 30;
    ctx.beginPath();
    ctx.ellipse(nose.x, nose.y - faceHeight * 0.1, faceWidth * 0.65, faceHeight * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    for (let index = 0; index < landmarks.length; index += 3) {
      const point = pointFor(index);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const enableDemoMode = useCallback((message) => {
    console.debug('[monitor] switching-to-demo-mode', { message });
    clearInterval(intervalRef.current);
    setPresageStatus({
      provider: 'demo',
      ready: false,
      message,
    });

    let nextVitals = randomVitals();
    setVitals(nextVitals);
    intervalRef.current = setInterval(() => {
      nextVitals = randomVitals(nextVitals);
      setVitals(nextVitals);
    }, 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch(`${API_BASE}/api/presage/status`);
        const data = await response.json();
        if (!cancelled) {
          setPresageStatus(data);
        }
      } catch {
        if (!cancelled) {
          setPresageStatus({
            provider: 'demo',
            ready: false,
            message: 'Presage bridge unavailable. Falling back to demo vitals.',
          });
        }
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    console.debug('[monitor] presage-status', presageStatus);
  }, [presageStatus]);

  useEffect(() => {
    console.debug('[monitor] camera-state', { cameraOn, faceDetected });
  }, [cameraOn, faceDetected]);

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    if (cameraUtilRef.current) {
      cameraUtilRef.current.stop();
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
    }

    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      console.debug('[monitor] capture-frame-skipped', {
        hasVideo: Boolean(video),
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
      });
      return null;
    }

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const context = captureCanvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL('image/jpeg', 0.85);
  };

  const pollPresage = useCallback(async () => {
    const image = captureFrame();

    if (!image) {
      return true;
    }

    try {
      const response = await fetch(`${API_BASE}/api/presage/measure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          sessionId: sessionIdRef.current,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Presage measurement failed');
      }

      console.debug('[monitor] presage-measure-success', data.vitals);
      setVitals((current) => ({
        ...current,
        ...data.vitals,
      }));
      return true;
    } catch (error) {
      enableDemoMode(error.message || 'Presage measurement failed. Falling back to demo vitals.');
      return false;
    }
  }, [enableDemoMode]);

  const startCamera = useCallback(async () => {
    try {
      console.debug('[monitor] start-camera', { provider: presageStatus.provider, ready: presageStatus.ready });

      if (!videoRef.current) {
        return;
      }

      const FaceMesh = window.FaceMesh;
      const Camera = window.Camera;

      if (!FaceMesh || !Camera) {
        console.debug('[monitor] mediapipe-missing');
        return;
      }

      const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const width = results.image.width;
        const height = results.image.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }

        ctx.clearRect(0, 0, width, height);

        if (results.multiFaceLandmarks?.length) {
          setFaceDetected(true);
          drawArOverlay(ctx, results.multiFaceLandmarks[0], width, height);
        } else {
          setFaceDetected(false);
        }
      });

      faceMeshRef.current = faceMesh;

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480,
      });

      await camera.start();
      cameraUtilRef.current = camera;
      setCameraOn(true);
      setAnalysis('');
      clearInterval(intervalRef.current);

      setVitals(randomVitals());

      if (presageStatus.ready) {
        await pollPresage();
        intervalRef.current = setInterval(() => {
          pollPresage();
        }, 3000);
      } else {
        enableDemoMode(presageStatus.message);
      }
    } catch (error) {
      console.debug('[monitor] start-camera-failed', error);
      setCameraOn(false);
    }
  }, [drawArOverlay, enableDemoMode, pollPresage, presageStatus]);

  const runAnalysis = async () => {
    if (!vitals) return;
    setAnalyzing(true);
    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vitals }),
      });
      const data = await response.json();
      setAnalysis(data.analysis || data.error);
    } catch {
      setAnalysis('Analysis unavailable. Check API connectivity.');
    } finally {
      setAnalyzing(false);
    }
  };

  const speakAnalysis = async () => {
    if (!analysis) return;
    setSpeaking(true);
    try {
      const response = await fetch(`${API_BASE}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysis }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
        };
        await audio.play();
      } else {
        setSpeaking(false);
      }
    } catch {
      setSpeaking(false);
    }
  };

  const logToBlockchain = async () => {
    if (!vitals) return;
    setLogging(true);
    try {
      const timestamp = new Date().toISOString();
      const response = await fetch(`${API_BASE}/api/log-vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vitalsHash: hashVitals(vitals), timestamp }),
      });
      const data = await response.json();
      if (data.signature) {
        setTxLog((current) => [{ sig: data.signature, url: data.explorerUrl, time: timestamp }, ...current]);
      }
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="main-content">
      <div className="video-section">
        <div className="camera-container">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
          <div className="camera-status">
            <span className={`status-dot ${cameraOn ? '' : 'inactive'}`} />
            {cameraOn
              ? faceDetected
                ? `Face tracked · ${presageStatus.ready ? 'Presage live' : 'Demo mode'}`
                : 'Searching for face...'
              : 'Camera off'}
          </div>
          {!cameraOn && (
            <div className="camera-placeholder">
              <p>Enable camera to start vitals monitoring.</p>
              <button className="checkin-btn" onClick={startCamera} type="button">Start Camera</button>
            </div>
          )}
        </div>

        <div className="vitals-grid">
          <div className="vital-card hr"><div className="vital-label">Heart Rate</div><div className="vital-value">{vitals?.heartRate ?? '--'}<span className="vital-unit"> bpm</span></div></div>
          <div className="vital-card br"><div className="vital-label">Breathing Rate</div><div className="vital-value">{vitals?.breathingRate ?? '--'}<span className="vital-unit"> br/min</span></div></div>
          <div className="vital-card stress"><div className="vital-label">Stress Level</div><div className="vital-value">{vitals?.stressLevel ?? '--'}<span className="vital-unit"> /100</span></div></div>
          <div className="vital-card spo2"><div className="vital-label">SpO2</div><div className="vital-value">{vitals?.spo2 ?? '--'}<span className="vital-unit"> %</span></div></div>
        </div>
      </div>

      <div className="sidebar">
        <button className="checkin-btn" disabled={!vitals || analyzing} onClick={runAnalysis} type="button">
          {analyzing ? 'Analyzing...' : 'Run Check-in'}
        </button>
        <div className="card">
          <div className="card-header"><span>AI Health Analysis</span><span>Gemini</span></div>
          <div className="card-body">
            {analysis ? <p className="analysis-text">{analysis}</p> : <p className="analysis-placeholder">Run a check-in to get AI-powered insights.</p>}
            {analysis && <button className="checkin-btn alt-btn" disabled={speaking} onClick={speakAnalysis} type="button">{speaking ? 'Speaking...' : 'Read aloud'}</button>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span>Blockchain Audit Trail</span><span>Solana</span></div>
          <div className="card-body">
            <button className="checkin-btn chain-btn" disabled={!vitals || logging} onClick={logToBlockchain} type="button">
              {logging ? 'Logging...' : 'Log vitals to blockchain'}
            </button>
            {txLog.length ? (
              <div className="blockchain-log">
                {txLog.map((tx) => (
                  <div className="tx-entry" key={tx.sig}>
                    <a href={tx.url} rel="noreferrer" target="_blank">{tx.sig.slice(0, 8)}...{tx.sig.slice(-8)}</a>
                    <span>{new Date(tx.time).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="analysis-placeholder">No transactions yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
