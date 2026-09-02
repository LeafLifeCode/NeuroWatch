import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Bell, Brain, CalendarDays, Check, ChevronRight, Clock3, HeartPulse, History as HistoryIcon, Home as HomeIcon, Info, LockKeyhole, Mail, Mic, Phone, Play, RotateCcw, Send, ShieldCheck, UserRound, X, Zap } from 'lucide-react'
import { submitSpeechTest, sendSosAlert, type SpeechTestResult } from './api/speechApi'

type Screen = 'home' | 'history' | 'profile' | 'speech' | 'speech-result' | 'cognitive'

type NavProps = { onNavigate: (screen: Screen) => void }

function Logo() { return <div className="logo"><span className="logo-mark"><HeartPulse size={21} /></span><span>Neuro<span>Watch</span></span></div> }
function Pill({ children, tone = 'stable' }: { children: ReactNode; tone?: 'stable' | 'attention' }) { return <span className={`pill ${tone}`}><i />{children}</span> }
function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [screen, setScreen] = useState<Screen>('home')
  const [modal, setModal] = useState(false)
  const [sosSent, setSosSent] = useState(false)
  const [sosSending, setSosSending] = useState(false)
  const [sosError, setSosError] = useState('')
  const [recording, setRecording] = useState(false)
  const [recorded, setRecorded] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [speechResult, setSpeechResult] = useState<SpeechTestResult | null>(null)
  const [speechError, setSpeechError] = useState('')
  const [cognitiveAnswer, setCognitiveAnswer] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('entry') === 'true' || params.get('patient_id') || params.get('role') === 'patient') {
      setLoggedIn(true)
    }
  }, [])

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => () => {
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current)
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])
  const notify = (message: string) => setToast(message)
  const go = (next: Screen) => { setScreen(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const resetAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setRecorded(false)
    setRecordingSeconds(0)
    audioChunksRef.current = []
  }
  const handleSendSos = async () => {
    setSosSending(true)
    setSosError('')
    try {
      await sendSosAlert('NW-1024', 'Emergency assistance requested by patient.')
      setSosSent(true)
    } catch (error) {
      setSosError(error instanceof Error ? error.message : 'Could not send emergency alert. Please try again.')
    } finally {
      setSosSending(false)
    }
  }
  const useMockRecordingFallback = () => {
    const mockAudio = new Blob(['NeuroWatch mock recording'], { type: 'audio/webm' })
    setAudioBlob(mockAudio)
    setAudioUrl(URL.createObjectURL(mockAudio))
    setRecorded(true)
    setRecording(false)
    setSpeechError('Microphone access was unavailable. A mock recording is ready; you can continue testing the flow.')
  }
  const startRecording = async () => {
    setSpeechError('')
    resetAudio()
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      useMockRecordingFallback()
      return
    }
    try {
      const permissionTimeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new DOMException('Microphone permission request timed out.', 'NotAllowedError')), 10000))
      const stream = await Promise.race([navigator.mediaDevices.getUserMedia({ audio: true }), permissionTimeout])
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data) }
      recorder.onerror = () => { setSpeechError('Recording failed. Please try again.'); mediaStreamRef.current?.getTracks().forEach((track) => track.stop()); setRecording(false) }
      recorder.start()
      setRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000)
    } catch (error) {
      if (import.meta.env.VITE_USE_MOCK_RECORDING_FALLBACK !== 'false') useMockRecordingFallback()
      else setSpeechError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Please allow microphone access and try again.' : 'We could not start recording. Please try again.')
    }
  }
  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') { setRecording(false); return }
    recorder.onstop = () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      if (audioChunksRef.current.length === 0) { setSpeechError('The recording was empty. Please record again.'); setRecording(false); return }
      const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      if (audioBlob.size === 0) { setSpeechError('The recording was empty. Please record again.'); setRecording(false); return }
      setAudioBlob(audioBlob)
      setAudioUrl(URL.createObjectURL(audioBlob))
      setRecorded(true)
      setRecording(false)
    }
    recorder.stop()
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
  }
  const playRecording = () => {
    if (!audioRef.current || !audioUrl) return
    audioRef.current.currentTime = 0
    void audioRef.current.play().catch(() => setSpeechError('This recording could not be played in the browser.'))
  }
  const submit = async () => {
    setProcessing(true); setSpeechError('')
    try {
      const result = await submitSpeechTest({ patient_id: 'NW-1024', test_id: `speech-${Date.now()}`, timestamp: new Date().toISOString() }, audioBlob)
      setSpeechResult(result); setScreen('speech-result')
    } catch (error) { setSpeechError(error instanceof Error ? error.message : 'We could not complete this check-in. Please try again.') }
    finally { setProcessing(false) }
  }
  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />
  return <div className="app-shell"><header className="topbar"><Logo /><div className="top-actions"><a href="http://localhost:5173" className="switch-role-tag" title="Switch Role / Return to Gateway">Switch Role</a><button className="icon-button" aria-label="Notifications" onClick={() => notify('You are all caught up')}><Bell size={20} /></button><button className="avatar" aria-label="Open profile" onClick={() => go('profile')}>RS</button></div></header><main className="content">{screen === 'home' && <Home onNavigate={go} onSos={() => { setSosError(''); setModal(true) }} />}{screen === 'history' && <History />}{screen === 'profile' && <Profile onLogout={() => setLoggedIn(false)} />}{screen === 'speech' && <Speech recording={recording} recorded={recorded} recordingSeconds={recordingSeconds} audioUrl={audioUrl} audioRef={audioRef} processing={processing} error={speechError} onBack={() => go('home')} onStart={startRecording} onStop={stopRecording} onAgain={() => { if (recording) stopRecording(); resetAudio(); setSpeechError('') }} onPlay={playRecording} onSubmit={submit} canSubmit={audioBlob !== null} />}{screen === 'speech-result' && <SpeechResult result={speechResult} onHistory={() => go('history')} onHome={() => go('home')} />}{screen === 'cognitive' && <Cognitive answer={cognitiveAnswer} onAnswer={(answer) => { setCognitiveAnswer(answer); notify(answer === 8 ? 'Exercise complete' : 'Your answer was recorded') }} onBack={() => go('home')} />}</main>{['home', 'history', 'profile'].includes(screen) && <BottomNav screen={screen} onNavigate={go} />}{modal && <SosModal sent={sosSent} sending={sosSending} error={sosError} onCancel={() => { setModal(false); setSosSent(false); setSosError('') }} onSend={handleSendSos} />}{toast && <div className="toast"><Check size={16} />{toast}</div>}</div>
}
function Login({ onLogin }: { onLogin: () => void }) { return <div className="login-page"><section className="login-art"><div className="art-circle circle-one" /><div className="art-circle circle-two" /><Logo /><div className="art-copy"><p className="eyebrow">YOUR RECOVERY COMPANION</p><h1>Your recovery,<br /><em>monitored.</em></h1><p>Small check-ins help you and your care team notice changes from your personal baseline.</p></div><div className="art-note"><ShieldCheck size={18} /> Your care journey, protected.</div></section><section className="login-panel"><div className="login-form"><p className="eyebrow">WELCOME BACK</p><h2>Sign in to NeuroWatch</h2><p className="muted">Continue your daily monitoring journey.</p><label>Patient ID or email<div className="input-wrap"><Mail size={18} /><input placeholder="e.g. ravi@email.com" /></div></label><label>PIN or password<div className="input-wrap"><LockKeyhole size={18} /><input type="password" placeholder="Enter your PIN" /></div></label><button className="primary-button full-width" onClick={onLogin}>Sign in <ChevronRight size={18} /></button><button className="text-button">Need help signing in? <strong>Contact support</strong></button><div className="disclaimer"><Info size={17} /><span>NeuroWatch is a monitoring tool and does not replace professional medical care.</span></div></div></section></div> }
function Home({ onNavigate, onSos }: NavProps & { onSos: () => void }) { return <div className="page home-page"><div className="home-heading"><div><p className="eyebrow">THURSDAY, AUGUST 21</p><h1>Good evening, Ravi</h1><p className="muted">Here is your monitoring overview.</p></div><div className="profile-badge"><UserRound size={19} /></div></div><section className="status-card"><div className="status-icon"><Check size={21} /></div><div><div className="status-label">MONITORING STATUS <Pill>Stable</Pill></div><h2>No significant change</h2><p>Your latest check-in is within your recent personal range.</p></div></section><div className="section-heading"><div><p className="eyebrow">TODAY'S PROGRESS</p><h2>Keep your rhythm</h2></div><b className="progress-count">1 <small>/ 3</small></b></div><div className="progress-card"><div className="progress-row"><span>Daily check-in completed</span><strong>1 of 3</strong></div><div className="progress-track"><i /></div><div className="progress-foot"><span><Check size={14} /> Speech check complete</span><span><Clock3 size={14} /> Last check-in 6:42 PM</span></div></div><section className="checkin-card"><div><div className="checkin-icon"><CalendarDays size={21} /></div><p className="eyebrow">NEXT UP</p><h2>Today's check-in</h2><p>Complete a short assessment to keep your care team updated.</p></div><div className="checkin-actions"><button onClick={() => onNavigate('speech')}><span><Mic size={19} /></span><b>Speech Test</b><ChevronRight size={17} /></button><button onClick={() => onNavigate('cognitive')}><span><Brain size={19} /></span><b>Cognitive Check</b><ChevronRight size={17} /></button></div></section><section className="care-banner"><div className="care-icon"><Phone size={19} /></div><div><p className="eyebrow">YOUR CARE CIRCLE</p><h3>Caregiver is connected</h3><p>Meera receives your monitoring updates.</p></div><ChevronRight size={18} /></section><button className="sos-button" onClick={onSos}><span><Zap size={19} fill="currentColor" /></span><b>Need immediate assistance?<small>Send an alert to your designated caregiver</small></b><ChevronRight size={20} /></button></div> }
function Speech({ recording, recorded, recordingSeconds, audioUrl, audioRef, processing, error, onBack, onStart, onStop, onAgain, onPlay, onSubmit, canSubmit }: { recording: boolean; recorded: boolean; recordingSeconds: number; audioUrl: string | null; audioRef: React.RefObject<HTMLAudioElement | null>; processing: boolean; error: string; onBack: () => void; onStart: () => void; onStop: () => void; onAgain: () => void; onPlay: () => void; onSubmit: () => void; canSubmit: boolean }) { if (processing) return <div className="center-state"><div className="loading-orbit"><Brain size={29} /></div><p className="eyebrow">ONE MOMENT</p><h1>Analyzing your<br />check-in...</h1><p className="muted">Comparing this check with your personal baseline.</p></div>; return <div className="page narrow-page"><BackButton onClick={onBack} label="Back to home" /><div className="screen-intro"><div className="screen-icon mint"><Mic size={24} /></div><p className="eyebrow">DAILY CHECK-IN · 01</p><h1>Speech Test</h1><p className="muted">Please read the sentence below clearly and naturally.</p></div><div className="read-card"><p className="eyebrow">READ ALOUD</p><blockquote>“The quick brown fox jumps over the lazy dog.”</blockquote><p className="muted">Take your time and find a comfortable pace.</p></div>{recording ? <div className="recording-state"><button className="mic-button recording" onClick={onStop}><i /><Mic size={30} /><small>Stop recording</small></button><strong className="timer">00:{String(recordingSeconds).padStart(2, '0')}</strong><p className="muted">Tap the microphone when you are finished.</p></div> : recorded ? <div className="recorded-controls"><audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" /><button className="secondary-button" onClick={onPlay}><Play size={18} fill="currentColor" /> Play recording</button><button className="primary-button" onClick={onSubmit} disabled={!canSubmit}>Submit test <Send size={17} /></button><button className="text-button" onClick={onAgain}><RotateCcw size={16} /> Record again</button></div> : <div className="recording-state"><button className="mic-button" onClick={onStart}><Mic size={30} /><small>Start recording</small></button><p className="muted">Your recording stays private to your care journey.</p></div>}{error && <div className="error-message"><AlertTriangle size={18} /><span>{error}</span><button onClick={onSubmit} disabled={!canSubmit}>Try again</button></div>}<div className="privacy-note"><ShieldCheck size={16} /><span>This is a monitoring exercise, not a diagnosis.</span></div></div> }
function SpeechResult({ result, onHistory, onHome }: { result: SpeechTestResult | null; onHistory: () => void; onHome: () => void }) { const data = result ?? { patient_id: 'NW-1024', status: 'stable' as const, deviation_score: 0.18, speech_rate: 105, pause_score: 0.12, message: 'No significant change from personal baseline.' }; return <div className="page narrow-page result-page"><div className="result-icon"><Check size={30} /></div><p className="eyebrow">CHECK-IN COMPLETE</p><h1>Speech Test<br /><em>Complete</em></h1><Pill>{data.status === 'stable' ? 'Within your recent personal range' : 'Significant change from baseline'}</Pill><p className="result-message">{data.message}</p><div className="result-metrics"><ResultMetric label="Status" value={data.status === 'stable' ? 'Stable' : 'Attention required'} /><ResultMetric label="Deviation score" value={data.deviation_score.toFixed(2)} /><ResultMetric label="Speech rate" value={`${data.speech_rate} words/min`} /><ResultMetric label="Pause pattern" value={data.pause_score.toFixed(2)} /></div><div className="baseline-note"><ShieldCheck size={18} /><span><strong>Compared with your personal baseline</strong><small>This result supports monitoring changes over time; it is not a diagnosis.</small></span></div><button className="primary-button full-width" onClick={onHistory}>View history <HistoryIcon size={18} /></button><button className="text-button" onClick={onHome}>Return to home</button></div> }
function ResultMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function History() { const entries = [['Today', 'Stable', 'Speech pattern within recent range', 'stable'], ['Yesterday', 'Stable', 'No significant change detected', 'stable'], ['Aug 18', 'Slight change', 'Pause pattern needs attention', 'attention'], ['Aug 17', 'Stable', 'Speech pattern within recent range', 'stable']]; return <div className="page"><div className="page-title"><div><p className="eyebrow">YOUR JOURNEY</p><h1>Monitoring History</h1><p className="muted">See how your check-ins change over time.</p></div><button className="icon-button" aria-label="History help"><Info size={19} /></button></div><section className="chart-card"><div className="chart-title"><div><p className="eyebrow">SPEECH PATTERN</p><h2>vs personal baseline</h2></div><Pill>Within range</Pill></div><div className="history-chart"><div className="chart-baseline">personal baseline</div><div className="chart-shape"><i /><i /><i /><i /><i /></div><div className="chart-labels"><span>Aug 17</span><span>Aug 18</span><span>Aug 19</span><span>Yesterday</span><span>Today</span></div></div></section><div className="section-heading history-heading"><div><p className="eyebrow">RECENT CHECK-INS</p><h2>Your activity</h2></div></div><div className="timeline">{entries.map(([date, label, detail, tone], index) => <div className="timeline-item" key={date}><i className={`timeline-dot ${tone}`} />{index < entries.length - 1 && <span className="timeline-line" />}<div><small>{date}</small><article><h3>{label}</h3><p>{detail}</p></article></div></div>)}</div><div className="disclaimer"><Info size={17} /><span>These check-ins help track changes over time. They are not medical diagnoses.</span></div></div> }
function Cognitive({ answer, onAnswer, onBack }: { answer: number | null; onAnswer: (answer: number) => void; onBack: () => void }) { return <div className="page narrow-page"><BackButton onClick={onBack} label="Back to home" /><div className="screen-intro"><div className="screen-icon lilac"><Brain size={24} /></div><p className="eyebrow">DAILY CHECK-IN · 02</p><h1>Cognitive Check</h1><p className="muted">A short focus exercise for your daily routine.</p></div><div className="question-card"><p className="eyebrow">WHICH NUMBER COMES NEXT?</p><div className="sequence"><b>2</b><i>+</i><b>2</b><i>+</i><b>2</b><i>=</i><strong>?</strong></div><p className="muted">Choose the number that completes the pattern.</p></div><div className="answer-grid">{[6, 8, 10, 12].map(option => <button className={answer === option ? 'selected' : ''} key={option} onClick={() => onAnswer(option)}>{option}{answer === option && <Check size={18} />}</button>)}</div>{answer !== null && <div className={`exercise-result ${answer === 8 ? 'correct' : ''}`}><Check size={18} /><span><strong>{answer === 8 ? 'Exercise complete' : 'Answer recorded'}</strong>{answer === 8 ? ' You selected the expected pattern.' : ' Monitoring exercises can be repeated later.'}</span></div>}<div className="privacy-note"><ShieldCheck size={16} /><span>This is a monitoring exercise, not a diagnostic test.</span></div></div> }
function Profile({ onLogout }: { onLogout: () => void }) { return <div className="page"><div className="page-title"><div><p className="eyebrow">YOUR ACCOUNT</p><h1>Profile</h1><p className="muted">Your monitoring preferences.</p></div><div className="profile-avatar">RS</div></div><section className="profile-card"><div className="profile-avatar">RS</div><div><h2>Ravi Sharma</h2><p>Patient ID · NW-1024</p></div></section><div className="settings-list"><Setting icon={<UserRound />} label="Designated caregiver" value="Meera Sharma" /><Setting icon={<Clock3 />} label="Monitoring schedule" value="Daily · 6:00 PM" /><Setting icon={<Bell />} label="Notifications" value="Caregiver updates on" /><Setting icon={<ShieldCheck />} label="Privacy & security" value="Your data is protected" /></div><button className="logout-button" onClick={onLogout}>Sign out</button><div className="disclaimer"><Info size={17} /><span>NeuroWatch supports monitoring conversations with your care team. It does not replace professional medical care.</span></div></div> }
function Setting({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <button className="setting-row" onClick={() => {}}><span className="setting-icon">{icon}</span><span><strong>{label}</strong><small>{value}</small></span><ChevronRight size={18} /></button> }
function BackButton({ onClick, label }: { onClick: () => void; label: string }) { return <button className="back-button" onClick={onClick}><ArrowLeft size={18} />{label}</button> }
function BottomNav({ screen, onNavigate }: { screen: Screen } & NavProps) { return <nav className="bottom-nav"><button className={screen === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><HomeIcon size={20} /><span>Home</span></button><button className={screen === 'history' ? 'active' : ''} onClick={() => onNavigate('history')}><HistoryIcon size={20} /><span>History</span></button><button className={screen === 'profile' ? 'active' : ''} onClick={() => onNavigate('profile')}><UserRound size={20} /><span>Profile</span></button></nav> }
function SosModal({ sent, sending, error, onCancel, onSend }: { sent: boolean; sending: boolean; error: string; onCancel: () => void; onSend: () => void }) { return <div className="modal-backdrop"><div className="sos-modal">{sent ? <><div className="sent-icon"><Send size={25} /></div><p className="eyebrow">ALERT CONFIRMED</p><h2>SOS Alert Sent</h2><p className="modal-copy">Your designated caregiver has been notified and will contact you shortly.</p><div className="sent-details"><span><Clock3 size={17} /><small>Time sent</small><strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Today</strong></span><span><Check size={17} /><small>Notification status</small><strong>Meera Sharma · Delivered</strong></span></div><button className="primary-button full-width" onClick={onCancel}>Done</button></> : <><button className="modal-close" onClick={onCancel} aria-label="Close"><X size={20} /></button><div className="sos-modal-icon"><Zap size={26} fill="currentColor" /></div><p className="eyebrow">CAREGIVER ALERT</p><h2>Emergency Assistance</h2><p className="modal-copy">Are you sure you need assistance? An alert will be sent to your designated caregiver.</p>{error && <div className="error-message" style={{ marginBottom: 12 }}><AlertTriangle size={18} /><span>{error}</span></div>}<div className="modal-actions"><button className="secondary-button" onClick={onCancel} disabled={sending}>Cancel</button><button className="sos-confirm" onClick={onSend} disabled={sending}>{sending ? 'Sending...' : <><Send size={18} />Send SOS</>}</button></div><p className="modal-footnote">For immediate medical emergencies, contact your local emergency services.</p></>}</div></div> }

export default App
