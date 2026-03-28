import { useState, useRef, useCallback, useEffect } from "react";
// MediaPipe loaded via CDN script tags in index.html
// Accessed as window.FaceMesh and window.Camera
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

// MediaPipe landmark indices
const LANDMARKS = {
  forehead: 10,
  noseTip: 1,
  chin: 152,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  rightCheek: 234,
  leftCheek: 454,
};

// Simulated vitals with slight variations (used before Presage connects)
function generateVitals(base) {
  const jitter = (val, range) =>
    Math.round(val + (Math.random() - 0.5) * range);
  return {
    heartRate: jitter(base?.heartRate || 72, 6),
    breathingRate: jitter(base?.breathingRate || 16, 3),
    stressLevel: jitter(base?.stressLevel || 28, 10),
    hrv: jitter(base?.hrv || 55, 8),
    spo2: Math.min(100, jitter(base?.spo2 || 98, 2)),
  };
}

function hashVitals(vitals) {
  const str = JSON.stringify(vitals);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── Monitor Page ───
function MonitorPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [vitals, setVitals] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [txLog, setTxLog] = useState([]);
  const [logging, setLogging] = useState(false);
  const [presageConnected, setPresageConnected] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const vitalsInterval = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraUtilRef = useRef(null);
  const latestVitals = useRef(null);

  // Keep a ref in sync so the MediaPipe callback can read current vitals
  useEffect(() => {
    latestVitals.current = vitals;
  }, [vitals]);

  const drawAROverlay = useCallback((ctx, landmarks, w, h) => {
    const v = latestVitals.current;
    if (!v) return;

    const lm = (idx) => ({
      x: (1 - landmarks[idx].x) * w, // mirror X to match CSS scaleX(-1)
      y: landmarks[idx].y * h,
    });

    const nose = lm(LANDMARKS.noseTip);
    const forehead = lm(LANDMARKS.forehead);
    const chin = lm(LANDMARKS.chin);
    const rightCheek = lm(LANDMARKS.rightCheek);
    const leftCheek = lm(LANDMARKS.leftCheek);

    // Face size for responsive badge placement
    const faceWidth = Math.abs(leftCheek.x - rightCheek.x);
    const faceHeight = Math.abs(chin.y - forehead.y);
    const offset = faceWidth * 0.7;

    const badges = [
      {
        label: "HR",
        value: `${v.heartRate} bpm`,
        x: rightCheek.x + offset,
        y: forehead.y,
        color: "#ef4444",
        anchor: nose,
      },
      {
        label: "BR",
        value: `${v.breathingRate} br/m`,
        x: rightCheek.x + offset,
        y: nose.y,
        color: "#3b82f6",
        anchor: nose,
      },
      {
        label: "SpO2",
        value: `${v.spo2}%`,
        x: leftCheek.x - offset,
        y: forehead.y,
        color: "#10b981",
        anchor: nose,
      },
      {
        label: "Stress",
        value: `${v.stressLevel}/100`,
        x: leftCheek.x - offset,
        y: nose.y,
        color: "#f59e0b",
        anchor: nose,
      },
      {
        label: "HRV",
        value: `${v.hrv} ms`,
        x: nose.x,
        y: chin.y + faceHeight * 0.4,
        color: "#8b5cf6",
        anchor: chin,
      },
    ];

    badges.forEach(({ label, value, x, y, color, anchor }) => {
      // Connector line
      ctx.beginPath();
      ctx.strokeStyle = color + "44";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, y);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Badge background
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const bw = 110,
        bh = 36,
        r = 8;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, r);
      ctx.fill();
      ctx.stroke();

      // Label text
      ctx.fillStyle = "#ffffff88";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x, y - 5);

      // Value text
      ctx.fillStyle = color;
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.fillText(value, x, y + 10);
    });

    // Scanning ellipse around face
    const t = Date.now() / 1000;
    ctx.strokeStyle = "#3b82f622";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = t * 30;
    ctx.beginPath();
    ctx.ellipse(
      nose.x,
      nose.y - faceHeight * 0.1,
      faceWidth * 0.65,
      faceHeight * 0.7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);

    // Face mesh dots (subtle, for "scanning" effect)
    ctx.fillStyle = "#3b82f618";
    for (let i = 0; i < landmarks.length; i += 3) {
      const p = lm(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!videoRef.current) return;

      // Initialize MediaPipe Face Mesh (loaded via CDN)
      const FaceMesh = window.FaceMesh;
      const Camera = window.Camera;
      if (!FaceMesh || !Camera) {
        console.warn("MediaPipe not loaded yet, retrying...");
        return;
      }

      const faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const w = results.image.width;
        const h = results.image.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);

        if (
          results.multiFaceLandmarks &&
          results.multiFaceLandmarks.length > 0
        ) {
          setFaceDetected(true);
          drawAROverlay(ctx, results.multiFaceLandmarks[0], w, h);
        } else {
          setFaceDetected(false);
        }
      });

      faceMeshRef.current = faceMesh;

      // Start camera via MediaPipe Camera utility
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

      // Try to connect Presage SDK
      try {
        if (window.Presage) {
          const presage = new window.Presage({
            apiKey: import.meta.env.VITE_PRESAGE_API_KEY,
          });
          presage.start(videoRef.current);
          presage.on("vitals", (data) => {
            setPresageConnected(true);
            setVitals({
              heartRate: Math.round(data.heartRate || data.hr),
              breathingRate: Math.round(data.breathingRate || data.br),
              stressLevel: Math.round(data.stress || data.stressLevel || 30),
              hrv: Math.round(data.hrv || 55),
              spo2: Math.round(data.spo2 || 98),
            });
          });
        }
      } catch {
        // Presage SDK not available, use simulation
      }

      // Start simulated vitals updates (fallback)
      let base = generateVitals();
      setVitals(base);
      vitalsInterval.current = setInterval(() => {
        base = generateVitals(base);
        setVitals(base);
      }, 2000);
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }, [drawAROverlay]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(vitalsInterval.current);
      if (cameraUtilRef.current) cameraUtilRef.current.stop();
      if (faceMeshRef.current) faceMeshRef.current.close();
    };
  }, []);

  const runAnalysis = async () => {
    if (!vitals) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vitals }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.error);
    } catch (err) {
      setAnalysis("Analysis unavailable — check API connection.");
    }
    setAnalyzing(false);
  };

  const speakAnalysis = async () => {
    if (!analysis) return;
    setSpeaking(true);
    try {
      const res = await fetch(`${API_BASE}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: analysis }),
      });
      if (res.ok) {
        const blob = await res.blob();
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
      const res = await fetch(`${API_BASE}/api/log-vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vitalsHash: hashVitals(vitals), timestamp }),
      });
      const data = await res.json();
      if (data.signature) {
        setTxLog((prev) => [
          { sig: data.signature, url: data.explorerUrl, time: timestamp },
          ...prev,
        ]);
      }
    } catch (err) {
      console.error("Blockchain logging failed:", err);
    }
    setLogging(false);
  };

  const runCheckin = async () => {
    await runAnalysis();
  };

  return (
    <div className="main-content">
      <div className="video-section">
        <div className="camera-container">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
          <div className="camera-status">
            <span className={`status-dot ${cameraOn ? "" : "inactive"}`} />
            {cameraOn
              ? presageConnected
                ? "Presage Connected"
                : faceDetected
                  ? "Face Tracked — AR Active"
                  : "Searching for face..."
              : "Camera Off"}
          </div>
          {!cameraOn && (
            <div className="camera-placeholder">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p>Enable camera to start vitals monitoring</p>
              <button onClick={startCamera}>Start Camera</button>
            </div>
          )}
        </div>

        <div className="vitals-grid">
          <div className="vital-card hr">
            <div className="vital-label">Heart Rate</div>
            <div className="vital-value">
              {vitals?.heartRate || "--"}
              <span className="vital-unit"> bpm</span>
            </div>
            <div
              className="vital-trend"
              style={{ color: "var(--accent-green)" }}
            >
              Normal range
            </div>
          </div>
          <div className="vital-card br">
            <div className="vital-label">Breathing Rate</div>
            <div className="vital-value">
              {vitals?.breathingRate || "--"}
              <span className="vital-unit"> br/min</span>
            </div>
            <div
              className="vital-trend"
              style={{ color: "var(--accent-green)" }}
            >
              Normal range
            </div>
          </div>
          <div className="vital-card stress">
            <div className="vital-label">Stress Level</div>
            <div className="vital-value">
              {vitals?.stressLevel || "--"}
              <span className="vital-unit"> /100</span>
            </div>
            <div
              className="vital-trend"
              style={{
                color:
                  vitals?.stressLevel > 60
                    ? "var(--accent-amber)"
                    : "var(--accent-green)",
              }}
            >
              {vitals?.stressLevel > 60 ? "Elevated" : "Low"}
            </div>
          </div>
          <div className="vital-card spo2">
            <div className="vital-label">SpO2</div>
            <div className="vital-value">
              {vitals?.spo2 || "--"}
              <span className="vital-unit"> %</span>
            </div>
            <div
              className="vital-trend"
              style={{ color: "var(--accent-green)" }}
            >
              Normal range
            </div>
          </div>
        </div>
      </div>

      <div className="sidebar">
        <button
          className="checkin-btn"
          onClick={runCheckin}
          disabled={!vitals || analyzing}
        >
          {analyzing ? (
            <>
              <span className="spinner" /> Analyzing...
            </>
          ) : (
            "Run Check-in"
          )}
        </button>

        <div className="card">
          <div className="card-header">
            <span>AI Health Analysis</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>
              Powered by Gemini
            </span>
          </div>
          <div className="card-body">
            {analysis ? (
              <>
                <p className="analysis-text">{analysis}</p>
                <button
                  className="checkin-btn"
                  style={{
                    marginTop: 12,
                    background: "linear-gradient(135deg, #10b981, #3b82f6)",
                    fontSize: 13,
                    padding: 10,
                  }}
                  onClick={speakAnalysis}
                  disabled={speaking}
                >
                  {speaking ? (
                    <>
                      <span className="spinner" /> Speaking...
                    </>
                  ) : (
                    "Read Aloud (ElevenLabs)"
                  )}
                </button>
              </>
            ) : (
              <p className="analysis-placeholder">
                Run a check-in to get AI-powered health insights.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span>Blockchain Audit Trail</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>Solana Devnet</span>
          </div>
          <div className="card-body">
            <button
              className="checkin-btn"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                fontSize: 13,
                padding: 10,
                marginBottom: 12,
              }}
              onClick={logToBlockchain}
              disabled={!vitals || logging}
            >
              {logging ? (
                <>
                  <span className="spinner" /> Logging...
                </>
              ) : (
                "Log Vitals to Blockchain"
              )}
            </button>
            {txLog.length > 0 ? (
              <div className="blockchain-log">
                {txLog.map((tx, i) => (
                  <div className="tx-entry" key={i}>
                    <span style={{ color: "var(--accent-green)" }}>
                      &#10003;
                    </span>
                    <a href={tx.url} target="_blank" rel="noopener noreferrer">
                      {tx.sig.slice(0, 8)}...{tx.sig.slice(-8)}
                    </a>
                    <span
                      style={{
                        marginLeft: "auto",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {new Date(tx.time).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="analysis-placeholder">
                No transactions yet. Log vitals to create an immutable audit
                trail.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Cite helper ───
function Cite({ id, url, children }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="cite-link"
      title={`Source [${id}]`}
    >
      {children}
      <sup>[{id}]</sup>
    </a>
  );
}

// ─── Business Plan Page ───
function BusinessPage() {
  return (
    <div className="page">
      <h1>Business Plan</h1>
      <p className="subtitle">
        VitalSight — Contactless Remote Patient Monitoring for Clinical Trials
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">$4B–$6B</div>
            <div className="stat-label">
              Wasted annually on clinical trial inefficiencies <sup>[1]</sup>
            </div>
          </a>
        </div>
        <div className="stat-card">
          <a
            href="https://www.appliedclinicaltrialsonline.com/view/enrollment-performance-weighing-facts"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">80%</div>
            <div className="stat-label">
              Of clinical trials fail to meet enrollment timelines{" "}
              <sup>[2]</sup>
            </div>
          </a>
        </div>
        <div className="stat-card">
          <a
            href="https://acrpnet.org/2023/02/22/unique-considerations-for-patient-retention-in-decentralized-clinical-trials"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">30%</div>
            <div className="stat-label">
              Average patient dropout rate in clinical trials <sup>[3]</sup>
            </div>
          </a>
        </div>
      </div>

      <h2>The Problem</h2>
      <p>
        It takes an average of{" "}
        <Cite id="4" url="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/">
          14 years
        </Cite>{" "}
        and over{" "}
        <Cite
          id="5"
          url="https://www.appliedclinicaltrialsonline.com/view/tufts-csdd-cost-develop-new-drug-26b"
        >
          $2.6B
        </Cite>{" "}
        to bring a single drug to market — driven largely by clinical trial
        complexity and failures. Frequent in-person vital sign checks create
        barriers for participants in rural and underserved communities, leading
        to high dropout rates and delayed approvals. A significant portion of
        these costs are self-inflicted — companies reinvent the wheel every time
        they conduct a trial, from setting up site networks to developing and
        implementing protocols. Shared clinical trial networks could eliminate
        much of this waste, but they remain few and far between (
        <Cite id="1" url="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/">
          NIH
        </Cite>
        ). Patients who could benefit from cutting-edge treatments are excluded
        simply because they live too far from a trial site.
      </p>

      <h2>Our Solution</h2>
      <p>
        VitalSight turns any device with a camera into a clinical-grade vitals
        monitoring station. Using advanced computer vision (rPPG technology via
        Presage), patients can complete vital sign check-ins from home — no
        wearable devices required. AI-powered analysis flags anomalies in
        real-time, while blockchain logging ensures data integrity for
        regulatory compliance.
      </p>

      <h2>Revenue Model</h2>
      <ul>
        <li>
          <strong>Per-Patient-Per-Month (PPPM):</strong> $50-200/patient/month
          SaaS subscription for Clinical Research Organizations (CROs)
        </li>
        <li>
          <strong>Platform License:</strong> Annual license for pharma companies
          running multiple trials
        </li>
        <li>
          <strong>Data Insights:</strong> Anonymized, aggregated health trend
          analytics for research
        </li>
      </ul>

      <h2>Competitive Advantage</h2>
      <ul>
        <li>
          <strong>No Hardware Required:</strong> Unlike competitors
          (BioIntelliSense, Current Health), we need only a webcam
        </li>
        <li>
          <strong>Immutable Audit Trail:</strong> Solana blockchain logging
          provides tamper-proof compliance data
        </li>
        <li>
          <strong>AI-Powered Insights:</strong> Real-time anomaly detection
          reduces missed adverse events
        </li>
        <li>
          <strong>Voice-Guided UX:</strong> ElevenLabs-powered voice coaching
          makes the platform accessible to elderly and low-literacy participants
        </li>
      </ul>

      <h2>Go-to-Market</h2>
      <ul>
        <li>
          <strong>Phase 1:</strong> Partner with 2-3 mid-size CROs for pilot
          studies
        </li>
        <li>
          <strong>Phase 2:</strong> Seek FDA 510(k) clearance for clinical-grade
          classification
        </li>
        <li>
          <strong>Phase 3:</strong> Expand to telehealth and chronic disease
          monitoring
        </li>
      </ul>

      <h2>Team & Ask</h2>
      <p>
        Seeking $500K seed funding for FDA regulatory pathway, clinical
        validation studies, and engineering team expansion. Target: 10 CRO
        partnerships within 18 months.
      </p>

      <div className="bibliography">
        <h2>Sources</h2>
        <ol>
          <li id="ref-1">
            <a
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sertkaya A, et al. "Key cost drivers of pharmaceutical clinical
              trials in the United States." Clinical Trials, National Institutes
              of Health, 2016.
            </a>
          </li>
          <li id="ref-2">
            <a
              href="https://www.appliedclinicaltrialsonline.com/view/enrollment-performance-weighing-facts"
              target="_blank"
              rel="noopener noreferrer"
            >
              Applied Clinical Trials. "Enrollment Performance: Weighing the
              Facts." Applied Clinical Trials Online.
            </a>
          </li>
          <li id="ref-3">
            <a
              href="https://acrpnet.org/2023/02/22/unique-considerations-for-patient-retention-in-decentralized-clinical-trials"
              target="_blank"
              rel="noopener noreferrer"
            >
              ACRP. "Unique Considerations for Patient Retention in
              Decentralized Clinical Trials." Association of Clinical Research
              Professionals, 2023.
            </a>
          </li>
          <li id="ref-4">
            <a
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sertkaya A, et al. "Key cost drivers of pharmaceutical clinical
              trials in the United States." Clinical Trials, NIH, 2016.
            </a>
          </li>
          <li id="ref-5">
            <a
              href="https://www.appliedclinicaltrialsonline.com/view/tufts-csdd-cost-develop-new-drug-26b"
              target="_blank"
              rel="noopener noreferrer"
            >
              Tufts Center for the Study of Drug Development. "Cost to Develop a
              New Drug is $2.6 Billion." Applied Clinical Trials Online.
            </a>
          </li>
        </ol>
      </div>
    </div>
  );
}

// ─── Social Impact Page ───
function ImpactPage() {
  return (
    <div className="page">
      <h1>Social Impact</h1>
      <p className="subtitle">
        Democratizing clinical trial access for underserved communities
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <a
            href="https://link.springer.com/article/10.1186/s12913-025-13698-2"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">~70%</div>
            <div className="stat-label">
              Of adults are willing to join a clinical trial — yet only 2–3% of
              adult cancer patients enroll <sup>[1]</sup>
            </div>
          </a>
        </div>
        <div className="stat-card">
          <a
            href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3863700/"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">$40B</div>
            <div className="stat-label">
              Annual economic burden of health disparities in the US{" "}
              <sup>[2]</sup>
            </div>
          </a>
        </div>
        <div className="stat-card">
          <a
            href="https://www.fda.gov/media/145718/download"
            target="_blank"
            rel="noopener noreferrer"
            className="stat-link"
          >
            <div className="stat-value">75%+</div>
            <div className="stat-label">
              Of clinical trial participants are white <sup>[3]</sup>
            </div>
          </a>
        </div>
      </div>

      <h2>The Challenge</h2>
      <p>
        Clinical trials are critical for developing life-saving treatments, yet
        participation remains deeply inequitable. Most adults say they would
        participate in a trial if asked — but geographic distance, lack of
        transportation, work obligations, and caregiving responsibilities
        disproportionately exclude rural communities, low-income families,
        elderly populations, and communities of color. The result: trial
        populations that don't reflect the people these treatments are meant to
        serve.
      </p>

      <h2>How VitalSight Helps</h2>
      <ul>
        <li>
          <strong>Zero Hardware Barrier:</strong> Any smartphone or laptop with
          a camera works — no expensive wearables or trips to a clinic
        </li>
        <li>
          <strong>Voice-Guided Accessibility:</strong> ElevenLabs-powered voice
          coaching guides patients through check-ins in natural language,
          supporting elderly and low-literacy users
        </li>
        <li>
          <strong>Remote Participation:</strong> Patients in rural areas can
          participate in trials from home, eliminating travel barriers
        </li>
        <li>
          <strong>Diverse Representation:</strong> By removing geographic and
          economic barriers, VitalSight can help clinical trials better
          represent the populations they serve
        </li>
        <li>
          <strong>Caregiver Flexibility:</strong> Check-ins take 2 minutes from
          home vs. half-day clinic visits, enabling participation for working
          parents and caregivers
        </li>
      </ul>

      <h2>Real-World Impact</h2>
      <p>
        When clinical trials include diverse populations, the resulting
        treatments are safer and more effective for everyone. VitalSight aims to
        increase trial enrollment from underserved communities by 3x within its
        first year of deployment, contributing to more equitable healthcare
        outcomes worldwide.
      </p>

      <div className="bibliography">
        <h2>Sources</h2>
        <ol>
          <li id="ref-1">
            <a
              href="https://link.springer.com/article/10.1186/s12913-025-13698-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              National Cancer Institute. "Why People Don't Join Clinical
              Trials." NCI, National Institutes of Health.
            </a>
          </li>
          <li id="ref-2">
            <a
              href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3863700/"
              target="_blank"
              rel="noopener noreferrer"
            >
              LaVeist TA, et al. "The Economic Burden of Health Inequalities in
              the United States." NIH PMC, 2013.
            </a>
          </li>
          <li id="ref-3">
            <a
              href="https://www.fda.gov/media/145718/download"
              target="_blank"
              rel="noopener noreferrer"
            >
              U.S. Food and Drug Administration. "Drug Trials Snapshots Summary
              Report." FDA, 2020.
            </a>
          </li>
        </ol>
      </div>
    </div>
  );
}

// ─── Synthetic Data Page ───
function SyntheticDataPage() {
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(20);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/generate-synthetic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const result = await res.json();
      setData(result.data);
    } catch {
      setData(null);
    }
    setGenerating(false);
  };

  const downloadCSV = () => {
    if (!data) return;
    const headers = [
      "age",
      "gender",
      "heartRate",
      "breathingRate",
      "stressLevel",
      "hrv",
      "spo2",
      "skinTone",
      "scenario",
      "label",
    ];
    const csv = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => `"${row[h] ?? ""}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vitalsight_synthetic_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <h1>Synthetic Data Generator</h1>
      <p className="subtitle">
        Generate labeled synthetic patient vitals for training computer vision
        health monitoring models. Powered by Google Gemini for realistic patient
        scenario generation.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <label style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Records:
        </label>
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          min={5}
          max={100}
          style={{
            width: 80,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 14,
          }}
        />
        <button
          className="generate-btn"
          onClick={generate}
          disabled={generating}
        >
          {generating ? (
            <>
              <span className="spinner" /> Generating...
            </>
          ) : (
            "Generate Dataset"
          )}
        </button>
        {data && (
          <button className="download-btn" onClick={downloadCSV}>
            Download CSV
          </button>
        )}
      </div>

      {data && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Age</th>
                <th>Gender</th>
                <th>HR</th>
                <th>BR</th>
                <th>Stress</th>
                <th>HRV</th>
                <th>SpO2</th>
                <th>Scenario</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td>{row.age}</td>
                  <td>{row.gender}</td>
                  <td>{row.heartRate}</td>
                  <td>{row.breathingRate}</td>
                  <td>{row.stressLevel}</td>
                  <td>{row.hrv}</td>
                  <td>{row.spo2}%</td>
                  <td>{row.scenario}</td>
                  <td>
                    <span className={`label-badge ${row.label}`}>
                      {row.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!data && !generating && (
        <div className="card">
          <div className="card-body">
            <p className="analysis-placeholder">
              Click "Generate Dataset" to create synthetic patient vitals using
              Gemini AI. The data includes diverse patient demographics, health
              scenarios, and labeled outcomes suitable for training computer
              vision models to detect health anomalies from facial cues.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App Shell ───
export default function App() {
  const [page, setPage] = useState("monitor");

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">VitalSight</span>
          <span className="header-badge">Clinical Trial Monitor</span>
        </div>
        <nav>
          <button
            className={`nav-btn ${page === "monitor" ? "active" : ""}`}
            onClick={() => setPage("monitor")}
          >
            Monitor
          </button>
          <button
            className={`nav-btn ${page === "synthetic" ? "active" : ""}`}
            onClick={() => setPage("synthetic")}
          >
            Synthetic Data
          </button>
          <button
            className={`nav-btn ${page === "business" ? "active" : ""}`}
            onClick={() => setPage("business")}
          >
            Business Plan
          </button>
          <button
            className={`nav-btn ${page === "impact" ? "active" : ""}`}
            onClick={() => setPage("impact")}
          >
            Social Impact
          </button>
        </nav>
      </header>

      {page === "monitor" && <MonitorPage />}
      {page === "synthetic" && <SyntheticDataPage />}
      {page === "business" && <BusinessPage />}
      {page === "impact" && <ImpactPage />}
    </div>
  );
}
