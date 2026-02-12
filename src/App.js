import React, { useState, useRef, useCallback } from 'react';
import './App.css';

const TABS = [
  { id: 'text', label: 'Text', icon: 'T', desc: 'Analyze written content' },
  { id: 'image', label: 'Image', icon: 'I', desc: 'Scan photos & graphics' },
  { id: 'video', label: 'Video', icon: 'V', desc: 'Check video files' },
  { id: 'document', label: 'Document', icon: 'D', desc: 'Inspect documents' },
];

const ICON_MAP = {
  ruler: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><path d="M15 2H9v4h6V2z"/><path d="M8 12h4"/><path d="M8 16h6"/></svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
  ),
  'align-left': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
  ),
  repeat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  'file-text': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  ),
  cpu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
  ),
  film: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
  ),
  hash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
  ),
  'bar-chart': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
  ),
  'trending-down': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
  ),
  'message-circle': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
  ),
  type: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
  ),
  'alert-triangle': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
  'list': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  ),
  'feather': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
  ),
};

function getIcon(name) {
  return ICON_MAP[name] || null;
}

function CircularGauge({ percentage, color }) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percentage / 100);

  return (
    <div className="gauge">
      <svg viewBox="0 0 180 180" width="180" height="180">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        <circle
          cx="90" cy="90" r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
          className="gauge-fill"
        />
      </svg>
      <div className="gauge-text">
        <span className="gauge-value">{percentage}%</span>
        <span className="gauge-label">AI Probability</span>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  // ─── Behavioral tracking state ───
  const behaviorRef = useRef({
    keystrokes: 0,
    pastedChars: 0,
    totalChars: 0,
    editCount: 0,
    lastLength: 0,
    inputStartTime: null,
    keystrokeTimes: [],
    lastKeystrokeTime: null,
  });

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setError(null);
    setResults(null);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const resetBehavior = useCallback(() => {
    behaviorRef.current = {
      keystrokes: 0,
      pastedChars: 0,
      totalChars: 0,
      editCount: 0,
      lastLength: 0,
      inputStartTime: null,
      keystrokeTimes: [],
      lastKeystrokeTime: null,
    };
  }, []);

  const handleTextChange = useCallback((e) => {
    const newValue = e.target.value;
    const b = behaviorRef.current;

    if (!b.inputStartTime && newValue.length > 0) {
      b.inputStartTime = Date.now();
    }

    const lengthDiff = newValue.length - b.lastLength;

    // Detect typing vs pasting: single char additions are keystrokes, large jumps are pastes
    if (lengthDiff > 0 && lengthDiff <= 3) {
      b.keystrokes += lengthDiff;
      const now = Date.now();
      if (b.lastKeystrokeTime) {
        b.keystrokeTimes.push(now - b.lastKeystrokeTime);
      }
      b.lastKeystrokeTime = now;
    }
    // Deletion = edit
    if (lengthDiff < 0) {
      b.editCount++;
    }
    b.totalChars = newValue.length;
    b.lastLength = newValue.length;

    setTextInput(newValue);
    setError(null);
  }, []);

  const handleTextPaste = useCallback((e) => {
    const pastedText = e.clipboardData?.getData('text') || '';
    behaviorRef.current.pastedChars += pastedText.length;
  }, []);

  const getBehaviorData = useCallback(() => {
    const b = behaviorRef.current;
    if (b.totalChars === 0) return null;

    const pasteRatio = b.totalChars > 0 ? b.pastedChars / b.totalChars : 0;
    const elapsed = b.inputStartTime ? (Date.now() - b.inputStartTime) / 1000 : 0;
    const avgCharsPerSecond = elapsed > 0.5 ? b.totalChars / elapsed : 0;

    // Typing burstiness: CV of inter-keystroke intervals
    let typingBurstiness = 0.5;
    if (b.keystrokeTimes.length >= 5) {
      const mean = b.keystrokeTimes.reduce((a, c) => a + c, 0) / b.keystrokeTimes.length;
      if (mean > 0) {
        const std = Math.sqrt(b.keystrokeTimes.reduce((s, v) => s + (v - mean) ** 2, 0) / b.keystrokeTimes.length);
        typingBurstiness = std / mean;
      }
    }

    return {
      pasteRatio: Math.min(pasteRatio, 1),
      avgCharsPerSecond,
      editCount: b.editCount,
      typingBurstiness,
      keystrokes: b.keystrokes,
      totalChars: b.totalChars,
    };
  }, []);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setResults(null);
    setError(null);
    setSelectedFile(null);
    setFilePreview(null);
    resetBehavior();
  };

  const API_BASE = process.env.REACT_APP_API_URL || '';

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      let res;
      if (activeTab === 'text') {
        if (!textInput.trim() || textInput.trim().length < 50) {
          throw new Error('Please enter at least 50 characters for accurate analysis.');
        }
        const payload = { text: textInput };
        const behavior = getBehaviorData();
        if (behavior) payload.behavior = behavior;
        res = await fetch(`${API_BASE}/api/analyze/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        if (!selectedFile) throw new Error('Please select a file to analyze.');
        const fd = new FormData();
        fd.append('file', selectedFile);
        res = await fetch(`${API_BASE}/api/analyze/file`, { method: 'POST', body: fd });
      }
      if (!res.ok) {
        const text = await res.text();
        try {
          const errData = JSON.parse(text);
          throw new Error(errData.error || `Server error (${res.status})`);
        } catch (parseErr) {
          if (parseErr.message.includes('Server error')) throw parseErr;
          throw new Error(`Server is not responding. Make sure the backend is running (npm run dev).`);
        }
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server returned an invalid response. Make sure the backend is running on port 5001.');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Cannot connect to the server. Make sure you run: npm run dev');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const gaugeColor = (p) => {
    if (p >= 75) return '#ef4444';
    if (p >= 55) return '#f59e0b';
    if (p >= 40) return '#eab308';
    return '#10b981';
  };

  const canAnalyze = activeTab === 'text' ? textInput.trim().length > 0 : !!selectedFile;

  return (
    <div className="app">
      {/* ─── Header ─── */}
      <header className="header">
        <div className="container header-inner">
          <a href="/" className="logo">
            <div className="logo-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <span className="logo-text">AI Detector</span>
          </a>
          <nav className="nav">
            <a href="#analyzer" className="nav-link">Analyze</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="container hero-inner">
          <div className="hero-content">
            <div className="hero-badge">37-Signal Detection Engine + Pixel Analysis + Behavioral Tracking</div>
            <h1>Detect AI-Generated<br />Content Instantly</h1>
            <p className="hero-sub">
              Upload text, images, videos, or documents and get instant analysis
              powered by 37 linguistic signals, bigram perplexity estimation,
              pixel-level image forensics, behavioral tracking, and
              cross-validated ensemble scoring. Know what's real.
            </p>
            <div className="hero-actions">
              <a href="#analyzer" className="btn btn-primary">
                Start Analyzing
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </a>
              <a href="#how-it-works" className="btn btn-ghost">Learn More</a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-card">
              <div className="hero-card-header">
                <div className="dot red" /><div className="dot yellow" /><div className="dot green" />
              </div>
              <div className="hero-gauge-wrap">
                <svg viewBox="0 0 120 120" width="100" height="100">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
                  <circle cx="60" cy="60" r="46" fill="none" stroke="url(#heroGrad)" strokeWidth="8"
                    strokeDasharray="289" strokeDashoffset="80" strokeLinecap="round"
                    transform="rotate(-90 60 60)" className="hero-gauge-anim" />
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6366f1"/>
                      <stop offset="100%" stopColor="#ec4899"/>
                    </linearGradient>
                  </defs>
                </svg>
                <span className="hero-gauge-pct">72%</span>
              </div>
              <div className="hero-card-label">AI Probability Detected</div>
              <div className="hero-card-bars">
                <div className="hbar"><span className="hbar-label">Uniformity</span><div className="hbar-track"><div className="hbar-fill" style={{width:'78%'}}/></div></div>
                <div className="hbar"><span className="hbar-label">Transitions</span><div className="hbar-track"><div className="hbar-fill" style={{width:'65%'}}/></div></div>
                <div className="hbar"><span className="hbar-label">Vocabulary</span><div className="hbar-track"><div className="hbar-fill" style={{width:'45%'}}/></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Analyzer ─── */}
      <section className="analyzer" id="analyzer">
        <div className="container">
          <div className="section-header">
            <h2>Analyze Content</h2>
            <p>Choose a content type and upload or paste your content for AI detection analysis.</p>
          </div>

          <div className="analyzer-card">
            {/* Tabs */}
            <div className="tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  <div className="tab-text">
                    <span className="tab-label">{tab.label}</span>
                    <span className="tab-desc">{tab.desc}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="input-area">
              {activeTab === 'text' ? (
                <div className="text-input-wrap">
                  <textarea
                    className="text-input"
                    placeholder="Paste your text here to analyze whether it was written by AI or a human...&#10;&#10;For best results, provide at least 100 words of continuous text.&#10;Typing behavior is tracked to improve detection accuracy."
                    value={textInput}
                    onChange={handleTextChange}
                    onPaste={handleTextPaste}
                    rows={10}
                  />
                  <div className="text-meta">
                    <span>{textInput.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{textInput.length} characters</span>
                  </div>
                </div>
              ) : (
                <div
                  className={`dropzone ${dragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    hidden
                    accept={
                      activeTab === 'image' ? 'image/*' :
                      activeTab === 'video' ? 'video/*' :
                      '.pdf,.doc,.docx,.txt,.rtf'
                    }
                    onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                  />
                  {selectedFile ? (
                    <div className="file-selected">
                      {filePreview ? (
                        <img src={filePreview} alt="Preview" className="file-thumb" />
                      ) : (
                        <div className="file-icon-big">
                          {activeTab === 'video' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                          )}
                        </div>
                      )}
                      <div className="file-details">
                        <span className="file-name">{selectedFile.name}</span>
                        <span className="file-size">{formatSize(selectedFile.size)}</span>
                      </div>
                      <button className="file-remove" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setFilePreview(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="dropzone-empty">
                      <div className="dropzone-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                      </div>
                      <div className="dropzone-text">
                        <span className="dropzone-main">
                          Drop your {activeTab} here, or <span className="dropzone-link">browse</span>
                        </span>
                        <span className="dropzone-formats">
                          {activeTab === 'image' && 'JPG, PNG, GIF, WebP, BMP — up to 50 MB'}
                          {activeTab === 'video' && 'MP4, AVI, MOV, WebM, MKV — up to 50 MB'}
                          {activeTab === 'document' && 'PDF, DOC, DOCX, TXT, RTF — up to 50 MB'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="error-msg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={loading || !canAnalyze}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Analyze Content
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ─── Results ─── */}
      {results && (
        <section className="results" ref={resultsRef}>
          <div className="container">
            <div className="section-header">
              <h2>Analysis Results</h2>
              <p>Here's what our analysis found about your {results.type || 'content'}.</p>
            </div>

            <div className="results-top">
              <div className="results-card score-card">
                <CircularGauge
                  percentage={results.aiProbability}
                  color={gaugeColor(results.aiProbability)}
                />
                <div className={`verdict-badge verdict-${results.verdictColor}`}>
                  {results.verdict}
                </div>
                {results.confidence && (
                  <span className="confidence-label">
                    Confidence: <strong>{results.confidence}</strong>
                  </span>
                )}
              </div>

              <div className="results-card breakdown-card">
                <h3>Probability Breakdown</h3>
                <div className="prob-bars">
                  <div className="prob-row">
                    <div className="prob-header">
                      <span className="prob-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
                        AI-Generated
                      </span>
                      <span className="prob-val">{results.aiProbability}%</span>
                    </div>
                    <div className="prob-track">
                      <div className="prob-fill ai-fill" style={{ width: `${results.aiProbability}%` }} />
                    </div>
                  </div>
                  <div className="prob-row">
                    <div className="prob-header">
                      <span className="prob-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        Human-Created
                      </span>
                      <span className="prob-val">{results.humanProbability}%</span>
                    </div>
                    <div className="prob-track">
                      <div className="prob-fill human-fill" style={{ width: `${results.humanProbability}%` }} />
                    </div>
                  </div>
                </div>

                {results.stats && (
                  <div className="stats-row">
                    <div className="stat-chip">
                      <span className="stat-num">{results.stats.wordCount}</span>
                      <span className="stat-lbl">Words</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-num">{results.stats.sentenceCount}</span>
                      <span className="stat-lbl">Sentences</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-num">{results.stats.uniqueWords}</span>
                      <span className="stat-lbl">Unique</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-num">{results.stats.avgSentenceLength}</span>
                      <span className="stat-lbl">Avg Length</span>
                    </div>
                  </div>
                )}

                {results.fileName && (
                  <div className="file-meta">
                    <div className="file-meta-row"><span>File</span><span>{results.fileName}</span></div>
                    {results.fileSize && <div className="file-meta-row"><span>Size</span><span>{formatSize(results.fileSize)}</span></div>}
                    {results.mimeType && <div className="file-meta-row"><span>Type</span><span>{results.mimeType}</span></div>}
                  </div>
                )}
              </div>
            </div>

            {results.details && results.details.length > 0 && (
              <div className="metrics-section">
                <h3>Detailed Metrics</h3>
                <div className="metrics-grid">
                  {results.details.map((d, i) => (
                    <div key={i} className="metric-card">
                      <div className="metric-top">
                        <div className="metric-icon-wrap">
                          {getIcon(d.icon)}
                        </div>
                        <div className="metric-info">
                          <span className="metric-name">{d.name}</span>
                          <span className={`metric-score ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}>
                            {d.score}%
                          </span>
                        </div>
                      </div>
                      <div className="metric-bar">
                        <div
                          className={`metric-fill ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}
                          style={{ width: `${d.score}%` }}
                        />
                      </div>
                      <p className="metric-desc">{d.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Behavioral analysis details */}
            {results.behavioralDetails && results.behavioralDetails.length > 0 && (
              <div className="metrics-section">
                <h3>Behavioral Analysis</h3>
                <p className="metrics-subtitle">Input behavior signals (typing speed, paste detection, edit patterns)</p>
                <div className="metrics-grid">
                  {results.behavioralDetails.map((d, i) => (
                    <div key={`bh-${i}`} className="metric-card">
                      <div className="metric-top">
                        <div className="metric-icon-wrap">
                          {getIcon(d.icon)}
                        </div>
                        <div className="metric-info">
                          <span className="metric-name">{d.name}</span>
                          <span className={`metric-score ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}>
                            {d.score}%
                          </span>
                        </div>
                      </div>
                      <div className="metric-bar">
                        <div
                          className={`metric-fill ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}
                          style={{ width: `${d.score}%` }}
                        />
                      </div>
                      <p className="metric-desc">{d.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Show extracted text analysis for documents */}
            {results.textAnalysisDetails && results.textAnalysisDetails.length > 0 && (
              <div className="metrics-section">
                <h3>Extracted Text — Linguistic Analysis</h3>
                <div className="metrics-grid">
                  {results.textAnalysisDetails.map((d, i) => (
                    <div key={`ta-${i}`} className="metric-card">
                      <div className="metric-top">
                        <div className="metric-icon-wrap">
                          {getIcon(d.icon)}
                        </div>
                        <div className="metric-info">
                          <span className="metric-name">{d.name}</span>
                          <span className={`metric-score ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}>
                            {d.score}%
                          </span>
                        </div>
                      </div>
                      <div className="metric-bar">
                        <div
                          className={`metric-fill ${d.score >= 60 ? 'high' : d.score >= 35 ? 'mid' : 'low'}`}
                          style={{ width: `${d.score}%` }}
                        />
                      </div>
                      <p className="metric-desc">{d.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.note && (
              <div className="results-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                {results.note}
              </div>
            )}

            <div className="results-disclaimer">
              <strong>Disclaimer:</strong> No AI detection tool achieves 100% accuracy. These results are based on statistical
              patterns and heuristic analysis. Always combine multiple verification methods for critical decisions.
              False positives and false negatives are possible.
            </div>
          </div>
        </section>
      )}

      {/* ─── Features ─── */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-header">
            <h2>Why AI Detector?</h2>
            <p>Advanced heuristic analysis across multiple content types.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, title: 'Text Analysis (37 Signals)', desc: '37 independent signals: bigram perplexity, token probability smoothness, function word stylometry, grammar perfection, tonal neutrality, AI clich\u00e9 detection, and cross-validated ensemble scoring.' },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, title: 'Image Detection (Pixel-Level)', desc: 'Error Level Analysis (ELA), color channel statistics, noise uniformity analysis, edge detection, plus metadata scanning and AI tool signature detection.' },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>, title: 'Video Analysis', desc: 'Expanded detection for 17+ AI video tools, audio track analysis, file structure verification, and recording device metadata.' },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, title: 'Document Scanning', desc: 'Text extraction from PDF/DOCX with full 37-signal linguistic analysis, plus metadata inspection for 14+ AI writing tools.' },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: 'Instant Results', desc: 'Get comprehensive analysis results in seconds with detailed confidence scoring and supporting evidence.' },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>, title: 'Privacy First', desc: 'Files are analyzed on the server and immediately deleted. No content is stored or shared with third parties.' },
            ].map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="how-it-works" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How It Works</h2>
            <p>Three simple steps to detect AI-generated content.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <h3>Upload Content</h3>
              <p>Paste text or upload a file — image, video, or document.</p>
            </div>
            <div className="step-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>AI Analysis</h3>
              <p>Our algorithms examine patterns, metadata, and linguistic features.</p>
            </div>
            <div className="step-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Get Results</h3>
              <p>Receive a detailed report with probability score and evidence.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>AI Detector</span>
          </div>
          <p className="footer-note">
            This tool uses heuristic and metadata-based analysis. Results are indicative and should not
            be considered definitive proof of AI generation. For critical decisions, use multiple detection methods.
          </p>
          <p className="footer-copy">&copy; 2026 AI Detector. Built for educational purposes.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
