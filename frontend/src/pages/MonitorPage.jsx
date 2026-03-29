import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/api';

function randomVitals() {
  return {
    heartRate: 68 + Math.round(Math.random() * 12),
    breathingRate: 14 + Math.round(Math.random() * 4),
    stressLevel: 22 + Math.round(Math.random() * 18),
    hrv: 48 + Math.round(Math.random() * 14),
    spo2: 97 + Math.round(Math.random() * 2),
  };
}

function hashVitals(vitals) {
  return Math.abs(JSON.stringify(vitals).split('').reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0)).toString(16);
}

export default function MonitorPage() {
  const videoRef = useRef(null);
  const intervalRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [vitals, setVitals] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [logging, setLogging] = useState(false);
  const [txLog, setTxLog] = useState([]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setVitals(randomVitals());
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setVitals(randomVitals());
      }, 3000);
    } catch {
      setCameraOn(false);
    }
  };

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
          <div className="camera-status">
            <span className={`status-dot ${cameraOn ? '' : 'inactive'}`} />
            {cameraOn ? 'Camera active' : 'Camera off'}
          </div>
          {!cameraOn && (
            <div className="camera-placeholder">
              <p>Enable camera to start vitals monitoring.</p>
              <button onClick={startCamera} type="button">Start Camera</button>
            </div>
          )}
        </div>

        <div className="vitals-grid">
          <div className="vital-card hr"><div className="vital-label">Heart Rate</div><div className="vital-value">{vitals?.heartRate || '--'}<span className="vital-unit"> bpm</span></div></div>
          <div className="vital-card br"><div className="vital-label">Breathing Rate</div><div className="vital-value">{vitals?.breathingRate || '--'}<span className="vital-unit"> br/min</span></div></div>
          <div className="vital-card stress"><div className="vital-label">Stress Level</div><div className="vital-value">{vitals?.stressLevel || '--'}<span className="vital-unit"> /100</span></div></div>
          <div className="vital-card spo2"><div className="vital-label">SpO2</div><div className="vital-value">{vitals?.spo2 || '--'}<span className="vital-unit"> %</span></div></div>
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
