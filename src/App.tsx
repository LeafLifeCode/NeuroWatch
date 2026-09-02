import { useEffect, useState } from 'react'
import { Activity, AlertCircle, Bell, Check, ChevronRight, Clock3, FileBarChart, HeartPulse, LayoutDashboard, Menu, MoreHorizontal, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Stethoscope, UserRound, Users, X, Zap } from 'lucide-react'
import { fetchPatients, fetchPatientHistory, fetchActiveAlerts, resolveAlert, type AssessmentHistoryItemApiData, type PatientApiData, type SOSAlertApiData } from './api/caregiverApi'

type UserRole = 'select' | 'caregiver'
type Page = 'dashboard' | 'patients' | 'alerts' | 'history' | 'settings'
type Filter = 'All' | 'Stable' | 'Needs Attention' | 'Alerts'
type Tone = 'stable' | 'attention' | 'alert'
type Patient = {
  name: string
  id: string
  status: Tone
  checkIn: string
  speech: string
  cognitive: string
  alerts: number
  score: number
  initials: string
}

const fallbackPatients: Patient[] = [
  { name: 'Ravi Kumar', id: 'NW-1024', status: 'stable', checkIn: 'Today, 8:42 PM', speech: 'Stable', cognitive: 'Stable', alerts: 0, score: 86, initials: 'RK' },
  { name: 'Arjun Menon', id: 'NW-1031', status: 'attention', checkIn: 'Today, 7:15 PM', speech: 'Slight change', cognitive: 'Stable', alerts: 1, score: 71, initials: 'AM' },
  { name: 'Priya Shah', id: 'NW-1008', status: 'alert', checkIn: 'Today, 6:52 PM', speech: 'Significant change', cognitive: 'Slight change', alerts: 2, score: 54, initials: 'PS' },
  { name: 'Nikhil Rao', id: 'NW-1017', status: 'stable', checkIn: 'Today, 6:35 PM', speech: 'Stable', cognitive: 'Stable', alerts: 0, score: 91, initials: 'NR' },
  { name: 'Meena Iyer', id: 'NW-1028', status: 'stable', checkIn: 'Today, 5:48 PM', speech: 'Stable', cognitive: 'Stable', alerts: 0, score: 82, initials: 'MI' },
  { name: 'Sanjay Das', id: 'NW-1012', status: 'attention', checkIn: 'Yesterday, 8:10 PM', speech: 'Slight change', cognitive: 'Stable', alerts: 1, score: 68, initials: 'SD' },
]

const statusMeta: Record<Tone, { label: string; className: string }> = {
  stable: { label: 'Stable', className: 'stable' },
  attention: { label: 'Needs attention', className: 'attention' },
  alert: { label: 'Alert', className: 'alert' },
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatCheckIn(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return isToday ? `Today, ${timeFormatted}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeFormatted}`
  } catch {
    return dateStr
  }
}

function apiPatientToUi(api: PatientApiData): Patient {
  return {
    name: api.name,
    id: api.patient_id,
    status: api.status,
    checkIn: formatCheckIn(api.last_check_in),
    speech: api.speech_trend,
    cognitive: api.cognitive_trend || 'Stable',
    alerts: api.alerts,
    score: api.status === 'stable' ? 86 : api.status === 'attention' ? 71 : 54,
    initials: getInitials(api.name),
  }
}

function Logo() { return <div className="logo"><span className="logo-mark"><HeartPulse size={21} /></span><span>Neuro<span>Watch</span></span></div> }
function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) { return <span className={`status-badge ${tone}`}><i />{children}</span> }

function App() {
  const [userRole, setUserRole] = useState<UserRole>('select')
  const [page, setPage] = useState<Page>('dashboard')
  const [selected, setSelected] = useState<Patient | null>(null)
  const [filter, setFilter] = useState<Filter>('All')
  const [search, setSearch] = useState('')
  const [notifications, setNotifications] = useState(false)
  const [toast, setToast] = useState('')

  const [patients, setPatients] = useState<Patient[]>(fallbackPatients)
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const [sosAlerts, setSosAlerts] = useState<SOSAlertApiData[]>([])
  const [historyMap, setHistoryMap] = useState<Record<string, AssessmentHistoryItemApiData[]>>({})
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadPatients = async () => {
    setLoadingPatients(true)
    setApiError(null)
    try {
      const data = await fetchPatients()
      setPatients(data.map(apiPatientToUi))
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Could not load live patient data.')
    } finally {
      setLoadingPatients(false)
    }
  }

  const loadAlerts = async () => {
    try {
      const alerts = await fetchActiveAlerts()
      setSosAlerts(alerts)
    } catch (error) {
      console.warn('Live alerts poll error:', error)
    }
  }

  useEffect(() => {
    void loadPatients()
    void loadAlerts()
    const pollingInterval = window.setInterval(() => {
      void loadAlerts()
    }, 6000)
    return () => window.clearInterval(pollingInterval)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const loadHistoryForPatient = async (patientId: string) => {
    setLoadingHistory(true)
    try {
      const history = await fetchPatientHistory(patientId)
      setHistoryMap((prev) => ({ ...prev, [patientId]: history }))
    } catch (error) {
      console.warn(`Failed loading history for ${patientId}:`, error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleResolveAlert = async (alertId: number) => {
    try {
      await resolveAlert(alertId)
      notify('Emergency alert marked as resolved.')
      await loadAlerts()
      await loadPatients()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed resolving alert.')
    }
  }

  const notify = (message: string) => setToast(message)
  const go = (next: Page) => { setSelected(null); setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openPatient = (patient: Patient) => {
    setSelected(patient)
    setPage('patients')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    void loadHistoryForPatient(patient.id)
  }

  if (userRole === 'select') {
    return <RoleSelector onSelectCaregiver={() => setUserRole('caregiver')} />
  }

  return (
    <div className="care-app">
      <header className="care-header">
        <button className="mobile-menu" aria-label="Open navigation" onClick={() => notify('Use the navigation menu to switch views')}><Menu size={21} /></button>
        <Logo />
        <span className="header-divider" />
        <span className="workspace-name">Caregiver Dashboard</span>
        <div className="header-actions">
          <button className="outline-button header-switch-btn" onClick={() => setUserRole('select')} title="Switch Role / Return to Gateway">
            Switch Role
          </button>
          {loadingPatients && <span className="api-loading-indicator"><RefreshCw size={14} className="spin" /> Syncing...</span>}
          <div className="notification-wrap">
            <button className="header-icon" aria-label="Notifications" onClick={() => setNotifications(!notifications)}>
              <Bell size={20} /><b>{sosAlerts.length > 0 ? sosAlerts.length : 3}</b>
            </button>
            {notifications && <NotificationPanel alerts={sosAlerts} onClose={() => setNotifications(false)} onOpen={() => { setNotifications(false); go('alerts') }} />}
          </div>
          <button className="header-icon desktop-only" aria-label="Settings" onClick={() => go('settings')}><Settings size={20} /></button>
          <button className="caregiver-chip" onClick={() => go('settings')}><span>DS</span><strong>Dr. Sharma</strong><ChevronRight size={15} /></button>
        </div>
      </header>

      {apiError && (
        <div className="api-error-bar">
          <AlertCircle size={17} />
          <span>Live API backend notice: {apiError} (Displaying available baseline fallback).</span>
          <button onClick={() => void loadPatients()}><RefreshCw size={14} /> Retry connection</button>
        </div>
      )}

      <div className="workspace">
        <Sidebar page={page} alertCount={sosAlerts.length} onNavigate={go} />
        <main className="main-content">
          {selected ? (
            <PatientDetail
              patient={selected}
              history={historyMap[selected.id] || []}
              loadingHistory={loadingHistory}
              onBack={() => setSelected(null)}
              onNotify={notify}
            />
          ) : page === 'dashboard' ? (
            <Dashboard patients={patients} sosAlerts={sosAlerts} loading={loadingPatients} onPatient={openPatient} onNavigate={go} onNotify={notify} />
          ) : page === 'patients' ? (
            <Patients patients={patients} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} onPatient={openPatient} />
          ) : page === 'alerts' ? (
            <Alerts patients={patients} sosAlerts={sosAlerts} onPatient={openPatient} onResolve={handleResolveAlert} onNotify={notify} />
          ) : page === 'history' ? (
            <HistoryPage patients={patients} onPatient={openPatient} />
          ) : (
            <SettingsPage onNotify={notify} />
          )}
        </main>
      </div>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function RoleSelector({ onSelectCaregiver }: { onSelectCaregiver: () => void }) {
  const [patientId, setPatientId] = useState('NW-1024')
  const [caregiverId, setCaregiverId] = useState('CG-001')

  const handlePatientContinue = () => {
    const targetUrl = `http://localhost:5174?entry=true&patient_id=${encodeURIComponent(patientId || 'NW-1024')}`
    window.location.href = targetUrl
  }

  return (
    <div className="role-gateway-page">
      <div className="gateway-container">
        <div className="gateway-brand">
          <Logo />
          <p className="gateway-eyebrow">REMOTE PATIENT MONITORING</p>
          <h1>Remote Stroke Patient Monitoring</h1>
          <p className="gateway-sub">Choose your role to enter the NeuroWatch platform.</p>
        </div>

        <div className="gateway-cards-grid">
          <div className="gateway-card patient-gateway">
            <div className="gateway-card-icon"><UserRound size={28} /></div>
            <h2>Patient</h2>
            <p className="gateway-card-desc">Complete your daily speech and cognitive check-ins from home.</p>

            <div className="gateway-form-group">
              <label htmlFor="patient-id-input">Patient ID</label>
              <input
                id="patient-id-input"
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="e.g. NW-1024"
              />
            </div>

            <button className="primary-button full-width gateway-submit-btn" onClick={handlePatientContinue}>
              Continue as Patient <ChevronRight size={18} />
            </button>
            <span className="gateway-default-hint">Default demo patient: <strong>NW-1024</strong></span>
          </div>

          <div className="gateway-card caregiver-gateway">
            <div className="gateway-card-icon caregiver"><Stethoscope size={28} /></div>
            <h2>Caregiver</h2>
            <p className="gateway-card-desc">Monitor patient baselines, review trends, and respond to SOS alerts.</p>

            <div className="gateway-form-group">
              <label htmlFor="caregiver-id-input">Caregiver ID</label>
              <input
                id="caregiver-id-input"
                type="text"
                value={caregiverId}
                onChange={(e) => setCaregiverId(e.target.value)}
                placeholder="e.g. CG-001"
              />
            </div>

            <button className="primary-button full-width gateway-submit-btn caregiver-btn" onClick={onSelectCaregiver}>
              Continue as Caregiver <ChevronRight size={18} />
            </button>
            <span className="gateway-default-hint">Default demo caregiver: <strong>CG-001</strong></span>
          </div>
        </div>

        <div className="gateway-footer">
          <ShieldCheck size={16} />
          <span>NeuroWatch supports remote monitoring for stroke recovery care teams.</span>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ page, alertCount, onNavigate }: { page: Page; alertCount: number; onNavigate: (page: Page) => void }) {
  const items: [Page, string, React.ReactNode][] = [
    ['dashboard', 'Dashboard', <LayoutDashboard size={19} />],
    ['patients', 'Patients', <Users size={19} />],
    ['alerts', 'Alerts', <AlertCircle size={19} />],
    ['history', 'Assessment History', <FileBarChart size={19} />],
    ['settings', 'Settings', <Settings size={19} />],
  ]
  return (
    <aside className="sidebar">
      <div className="sidebar-label">WORKSPACE</div>
      <nav>
        {items.map(([key, label, icon]) => (
          <button className={page === key ? 'active' : ''} onClick={() => onNavigate(key)} key={key}>
            {icon}<span>{label}</span>{key === 'alerts' && <em>{alertCount > 0 ? alertCount : 3}</em>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="support-card"><ShieldCheck size={19} /><strong>Monitoring guidance</strong><span>Changes from baseline are not diagnoses.</span></div>
        <div className="signed-in"><span className="mini-avatar">DS</span><div><strong>Dr. Sharma</strong><small>Caregiver account</small></div><MoreHorizontal size={18} /></div>
      </div>
    </aside>
  )
}

function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>
}

function Summary({ label, value, icon, tone = 'default' }: { label: string; value: string; icon: React.ReactNode; tone?: string }) {
  return <div className={`summary-card ${tone}`}><div className="summary-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div><span className="summary-period">Today</span></div>
}

function Dashboard({ patients: list, sosAlerts, loading, onPatient, onNavigate, onNotify }: { patients: Patient[]; sosAlerts: SOSAlertApiData[]; loading: boolean; onPatient: (patient: Patient) => void; onNavigate: (page: Page) => void; onNotify: (message: string) => void }) {
  const totalCount = list.length
  const stableCount = list.filter((p) => p.status === 'stable').length
  const attentionCount = list.filter((p) => p.status === 'attention').length
  const activeSosCount = sosAlerts.length
  const latestSos = sosAlerts.length > 0 ? sosAlerts[0] : null

  return (
    <div className="page">
      <PageHeader eyebrow="DAILY MONITORING" title="Good evening, Dr. Sharma" subtitle="Here's the latest monitoring overview for your patients." action={<button className="outline-button" onClick={() => onNavigate('history')}><FileBarChart size={17} /> View analytics</button>} />
      <section className="summary-grid">
        <Summary label="Total patients" value={String(totalCount)} icon={<Users />} />
        <Summary label="Stable" value={String(stableCount)} icon={<Check />} tone="stable" />
        <Summary label="Needs attention" value={String(attentionCount)} icon={<Activity />} tone="attention" />
        <Summary label="SOS alerts" value={String(activeSosCount)} icon={<Zap />} tone="alert" />
      </section>

      {latestSos ? (
        <div className="urgent-strip">
          <div className="urgent-symbol"><Zap size={19} fill="currentColor" /></div>
          <div><strong>1 active SOS alert needs your attention</strong><span>{latestSos.patient_name} ({latestSos.patient_id}): {latestSos.message} ({formatCheckIn(latestSos.timestamp)})</span></div>
          <button onClick={() => onNavigate('alerts')}>Review alert <ChevronRight size={16} /></button>
        </div>
      ) : (
        <div className="urgent-strip" style={{ opacity: 0.85 }}>
          <div className="urgent-symbol" style={{ backgroundColor: 'var(--color-mint-subtle, #e6f4ea)', color: 'var(--color-mint, #0f9d58)' }}><Check size={19} /></div>
          <div><strong>No active SOS emergency alerts</strong><span>All patient emergency requests are currently resolved.</span></div>
          <button onClick={() => onNavigate('alerts')}>Alert center <ChevronRight size={16} /></button>
        </div>
      )}

      <div className="section-head">
        <div><p className="eyebrow">PATIENT OVERVIEW</p><h2>Monitoring at a glance</h2></div>
        <button className="text-button" onClick={() => onNavigate('patients')}>View all patients <ChevronRight size={16} /></button>
      </div>
      {loading ? <div className="center-loading"><RefreshCw size={22} className="spin" /> Loading patients from backend...</div> : <PatientTable patients={list.slice(0, 5)} onPatient={onPatient} onNotify={onNotify} />}
      <Analytics />
    </div>
  )
}

function PatientTable({ patients: list, onPatient, onNotify }: { patients: Patient[]; onPatient: (patient: Patient) => void; onNotify: (message: string) => void }) {
  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div className="table-title"><Users size={18} /><strong>Patients requiring monitoring</strong></div>
        <button className="filter-button" onClick={() => onNotify('Patient filters are available on the Patients page')}><SlidersHorizontal size={16} /> Filters</button>
      </div>
      <div className="patient-table">
        <div className="table-row table-head">
          <span>Patient</span><span>Status</span><span>Last check-in</span><span>Speech trend</span><span>Cognitive trend</span><span>Alerts</span><span />
        </div>
        {list.map((patient) => (
          <button className="table-row patient-row" key={patient.id} onClick={() => onPatient(patient)}>
            <span className="patient-name"><i className={`patient-avatar ${patient.status}`}>{patient.initials}</i><b>{patient.name}</b><small>{patient.id}</small></span>
            <span><Badge tone={patient.status}>{statusMeta[patient.status].label}</Badge></span>
            <span>{patient.checkIn}</span>
            <span className={patient.status === 'stable' ? 'positive' : patient.status === 'attention' ? 'warning' : 'negative'}>{patient.speech}</span>
            <span>{patient.cognitive}</span>
            <span className="alert-count">{patient.alerts || '-'}</span>
            <span className="row-action">View <ChevronRight size={15} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Analytics() {
  return (
    <section className="analytics-section">
      <div className="section-head"><div><p className="eyebrow">TEAM INSIGHTS</p><h2>Monitoring analytics</h2></div><span className="period-label">Last 7 days <ChevronRight size={14} /></span></div>
      <div className="analytics-grid">
        <div className="analytics-card completion"><div><span>Patient monitoring completion</span><strong>84%</strong></div><div className="donut"><b>84<small>%</small></b></div><p><Check size={15} /> +6% from last week</p></div>
        <div className="analytics-card"><span>Assessments completed</span><div className="bar-chart">{[55, 72, 62, 85, 78, 92, 69].map((height, index) => <i style={{ height: `${height}%` }} key={index} />)}</div><div className="chart-caption"><strong>68</strong><span>This week</span></div></div>
        <div className="analytics-card"><span>Average deviation from baseline</span><div className="mini-line"><span /><span /><span /><span /><span /><span /></div><div className="chart-caption"><strong>4.2%</strong><span className="positive">Within range</span></div></div>
      </div>
    </section>
  )
}

function Patients({ patients: list, filter, setFilter, search, setSearch, onPatient }: { patients: Patient[]; filter: Filter; setFilter: (filter: Filter) => void; search: string; setSearch: (search: string) => void; onPatient: (patient: Patient) => void }) {
  const filters: Filter[] = ['All', 'Stable', 'Needs Attention', 'Alerts']
  const filtered = list.filter((patient) => (filter === 'All' || (filter === 'Stable' && patient.status === 'stable') || (filter === 'Needs Attention' && patient.status === 'attention') || (filter === 'Alerts' && patient.status === 'alert')) && (patient.name.toLowerCase().includes(search.toLowerCase()) || patient.id.toLowerCase().includes(search.toLowerCase())))
  return (
    <div className="page">
      <PageHeader eyebrow={`CARE NETWORK · ${list.length} PATIENTS`} title="Patients" subtitle="Review check-ins and changes from each patient's personal baseline." />
      <div className="search-row">
        <div className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patients by name or ID..." /></div>
        <button className="outline-button"><Users size={17} /> Add patient</button>
      </div>
      <div className="filter-tabs">
        {filters.map((item) => (
          <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>
            {item}{item === 'Alerts' && <b>{list.filter((p) => p.status === 'alert').length || 3}</b>}
          </button>
        ))}
      </div>
      <PatientTable patients={filtered} onPatient={onPatient} onNotify={() => {}} />
    </div>
  )
}

function PatientDetail({ patient, history, loadingHistory, onBack, onNotify }: { patient: Patient; history: AssessmentHistoryItemApiData[]; loadingHistory: boolean; onBack: () => void; onNotify: (message: string) => void }) {
  const latestItem = history.length > 0 ? history[0] : null
  const deviationVal = latestItem ? latestItem.deviation_score : 0.18
  const speechRateVal = latestItem ? latestItem.speech_rate : 105
  const pauseScoreVal = latestItem ? latestItem.pause_score : 0.12

  const trendValues = history.length > 0 ? history.map((item) => Math.min(100, Math.max(30, Math.round(100 - item.deviation_score * 50)))).reverse() : [58, 68, 64, 76, 70, 82, patient.score]

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}>← Back to patients</button>
      <div className="detail-header">
        <div className="detail-person">
          <i className={`patient-avatar ${patient.status}`}>{patient.initials}</i>
          <div><p className="eyebrow">PATIENT PROFILE</p><h1>{patient.name}</h1><span>Patient ID · {patient.id}</span></div>
        </div>
        <div className="detail-actions">
          <Badge tone={patient.status}>{statusMeta[patient.status].label}</Badge>
          <button className="outline-button" onClick={() => onNotify('Caregiver contact action is mocked for this prototype')}><Stethoscope size={17} /> Contact caregiver</button>
        </div>
      </div>

      <div className="detail-meta">
        <span><Clock3 size={16} /> Last assessment <b>{latestItem ? formatCheckIn(latestItem.timestamp) : patient.checkIn}</b></span>
        <span><Activity size={16} /> Latest status <b className={patient.status === 'stable' ? 'positive' : 'warning'}>{patient.status === 'stable' ? 'Within personal baseline' : 'Review recommended'}</b></span>
      </div>

      {patient.status !== 'stable' && <AlertCard patient={patient} onNotify={onNotify} />}

      <div className="live-metrics-strip">
        <div className="metric-tile"><span>Latest Deviation Score</span><strong>{deviationVal.toFixed(2)}</strong></div>
        <div className="metric-tile"><span>Speech Activity Rate</span><strong>{speechRateVal} <small>activity %</small></strong></div>
        <div className="metric-tile"><span>Average Pause Duration</span><strong>{pauseScoreVal.toFixed(2)}s</strong></div>
      </div>

      <div className="detail-charts">
        <TrendCard title="Speech Pattern Over Time" color="teal" values={trendValues} baseline="Personal baseline" />
        <TrendCard title="Cognitive Pattern Over Time" color="purple" values={[70, 73, 77, 74, 78, 80, 81]} baseline="Personal baseline" />
      </div>

      <section className="detail-history">
        <div className="section-head">
          <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Assessment history {loadingHistory && <RefreshCw size={14} className="spin inline" />}</h2></div>
          <button className="text-button" onClick={() => onNotify('Full assessment history is displayed below')}>View all <ChevronRight size={16} /></button>
        </div>

        {history.length > 0 ? (
          <div className="assessment-list">
            {history.map((item) => (
              <Assessment
                key={item.test_id}
                date={formatCheckIn(item.timestamp)}
                type="Speech check"
                label={item.message || (item.status === 'stable' ? 'Within personal baseline' : 'Significant deviation from baseline')}
                tone={item.status === 'stable' ? 'stable' : 'attention'}
              />
            ))}
          </div>
        ) : (
          <div className="assessment-list">
            <Assessment date={patient.checkIn} type="Speech check" label={patient.status === 'stable' ? 'Within personal baseline' : 'Significant deviation from baseline'} tone={patient.status === 'stable' ? 'stable' : 'alert'} />
            <Assessment date="Aug 20 · 8:37 PM" type="Speech check" label="Within personal baseline" tone="stable" />
            <Assessment date="Aug 19 · 8:51 PM" type="Speech check" label="Slight deviation" tone="attention" />
          </div>
        )}
      </section>

      <div className="detail-disclaimer">
        <ShieldCheck size={17} /><span>Monitoring data shows changes over time compared with this patient's personal baseline. It is not a medical diagnosis.</span>
      </div>
    </div>
  )
}

function TrendCard({ title, color, values, baseline }: { title: string; color: string; values: number[]; baseline: string }) {
  return (
    <div className="trend-card">
      <div className="trend-head">
        <div><p className="eyebrow">{title === 'Speech Pattern Over Time' ? 'SPEECH MONITORING' : 'COGNITIVE MONITORING'}</p><h2>{title}</h2></div>
        <button className="icon-button" aria-label="More chart options"><MoreHorizontal size={18} /></button>
      </div>
      <div className={`large-chart ${color}`}>
        <div className="grid-lines"><i /><i /><i /><i /></div>
        <div className="baseline"><span>{baseline}</span></div>
        <div className="trend-points">{values.map((value, index) => <i key={index} style={{ left: `${index * 14.5}%`, bottom: `${Math.max(10, Math.min(85, value - 30))}%` }} />)}</div>
        <div className="trend-svg" />
      </div>
      <div className="chart-legend">
        <span><i className="legend-current" /> Recent measurement</span>
        <span><i className="legend-baseline" /> Personal baseline</span>
        <small>Recent <b>Today</b></small>
      </div>
    </div>
  )
}

function Assessment({ date, type, label, tone }: { date: string; type: string; label: string; tone: Tone }) {
  return (
    <div className="assessment">
      <div className={`assessment-dot ${tone}`} />
      <div><span>{date}</span><strong>{type}</strong><p><Badge tone={tone}>{label}</Badge></p></div>
      <ChevronRight size={17} />
    </div>
  )
}

function AlertCard({ patient, onNotify }: { patient: Patient; onNotify: (message: string) => void }) {
  return (
    <div className="alert-card">
      <div className="alert-symbol"><AlertCircle size={20} /></div>
      <div>
        <p className="eyebrow">ATTENTION REQUIRED · {patient.checkIn}</p>
        <h3>Significant deviation from personal baseline detected</h3>
        <p>{patient.name}'s speech pattern deviated from their recent personal baseline.</p>
      </div>
      <div className="alert-actions">
        <button onClick={() => onNotify('Assessment opened in review mode')}>Review assessment</button>
        <button onClick={() => onNotify('Caregiver contact action is mocked')}>Contact caregiver</button>
        <button className="mark-reviewed" onClick={() => onNotify('Alert marked as reviewed')}><Check size={15} /> Mark as reviewed</button>
      </div>
    </div>
  )
}

function Alerts({ patients: list, sosAlerts, onPatient, onResolve, onNotify }: { patients: Patient[]; sosAlerts: SOSAlertApiData[]; onPatient: (patient: Patient) => void; onResolve: (alertId: number) => void; onNotify: (message: string) => void }) {
  const alertPatients = list.filter((p) => p.status !== 'stable')
  const topSos = sosAlerts.length > 0 ? sosAlerts[0] : null

  return (
    <div className="page">
      <PageHeader eyebrow="RESPONSE CENTER" title="Alerts" subtitle="Review monitoring alerts and respond to changes in your care network." action={<button className="outline-button" onClick={() => onNotify('Showing unread alerts')}>Unread only</button>} />
      <div className="alert-summary">
        {topSos ? (
          <div className="sos-banner">
            <Zap size={20} fill="currentColor" />
            <div><span>ACTIVE SOS ALERT · UNREAD</span><h2>{topSos.patient_name} requested emergency assistance.</h2><p>{formatCheckIn(topSos.timestamp)} · {topSos.message}</p></div>
            <Badge tone="alert">Urgent</Badge>
          </div>
        ) : (
          <div className="sos-banner" style={{ background: 'var(--color-mint-subtle, #e6f4ea)', borderColor: 'var(--color-mint, #0f9d58)' }}>
            <Check size={20} />
            <div><span>SOS ALERT STATUS</span><h2>No unresolved emergency SOS alerts</h2><p>All emergency assistance requests have been reviewed and resolved.</p></div>
            <Badge tone="stable">Clear</Badge>
          </div>
        )}
        <div className="alert-summary-stats">
          <strong>{sosAlerts.length + alertPatients.length} <small>Open alerts</small></strong>
          <strong>{sosAlerts.length} <small>Active SOS</small></strong>
          <strong>{alertPatients.length} <small>Monitoring changes</small></strong>
        </div>
      </div>
      <div className="section-head"><div><p className="eyebrow">ALERT QUEUE</p><h2>Needs your review</h2></div><button className="text-button" onClick={() => onNotify('Showing active alerts queue')}>Refresh alerts queue</button></div>
      <div className="alert-list">
        {sosAlerts.map((sos) => (
          <div className="alert-row urgent" key={sos.id}>
            <div className="alert-row-icon"><Zap size={19} fill="currentColor" /></div>
            <div className="alert-row-copy">
              <div><span className="alert-type">SOS ALERT (UNRESOLVED)</span><span className="alert-time">{formatCheckIn(sos.timestamp)}</span></div>
              <h3>{sos.patient_name} ({sos.patient_id})</h3>
              <p>{sos.message}</p>
            </div>
            <Badge tone="alert">Active SOS</Badge>
            <div className="alert-row-actions">
              <button onClick={() => {
                const match = list.find((p) => p.id === sos.patient_id)
                if (match) onPatient(match)
                else onNotify(`Patient ID ${sos.patient_id} selected.`)
              }}>View patient</button>
              <button className="mark-reviewed" onClick={() => onResolve(sos.id)}><Check size={15} /> Resolve alert</button>
            </div>
          </div>
        ))}
        {alertPatients.map((patient) => (
          <AlertRow key={patient.id} patient={patient} onPatient={onPatient} onNotify={onNotify} />
        ))}
      </div>
      <div className="detail-disclaimer"><ShieldCheck size={17} /><span>An alert indicates a change requiring attention. It does not indicate a diagnosis.</span></div>
    </div>
  )
}

function AlertRow({ patient, urgent = false, onPatient, onNotify }: { patient: Patient; urgent?: boolean; onPatient: (patient: Patient) => void; onNotify: (message: string) => void }) {
  return (
    <div className={`alert-row ${urgent ? 'urgent' : ''}`}>
      <div className="alert-row-icon">{urgent ? <Zap size={19} fill="currentColor" /> : <AlertCircle size={19} />}</div>
      <div className="alert-row-copy">
        <div><span className="alert-type">{urgent ? 'SOS ALERT' : 'MONITORING ALERT'}</span><span className="alert-time">{patient.checkIn}</span></div>
        <h3>{patient.name}</h3>
        <p>{urgent ? 'Patient requested emergency assistance.' : 'Significant deviation from recent personal baseline detected.'}</p>
      </div>
      <Badge tone={urgent ? 'alert' : patient.status}>{urgent ? 'Unread' : 'Review'}</Badge>
      <div className="alert-row-actions">
        <button onClick={() => onPatient(patient)}>View patient</button>
        <button onClick={() => onNotify('Alert marked as reviewed')}><Check size={15} /> Review</button>
      </div>
    </div>
  )
}

function HistoryPage({ patients: list, onPatient }: { patients: Patient[]; onPatient: (patient: Patient) => void }) {
  return (
    <div className="page">
      <PageHeader eyebrow="LONG-TERM VIEW" title="Assessment History" subtitle="Compare patient activity and changes from personal baselines over time." />
      <div className="history-layout">
        <div className="wide-trend"><TrendCard title="All patient speech patterns" color="teal" values={[54, 62, 59, 75, 67, 78, 73]} baseline="Team baseline" /></div>
        <div className="history-side">
          <div className="history-stat"><span>Assessments this week</span><strong>68</strong><small>+12% vs last week</small></div>
          <div className="history-stat"><span>Patients with changes</span><strong>{list.filter((p) => p.status !== 'stable').length || 2}</strong><small>Requires review</small></div>
        </div>
      </div>
      <div className="section-head history-list-head"><div><p className="eyebrow">RECENT ASSESSMENTS</p><h2>Activity log</h2></div></div>
      <div className="log-card">
        {list.slice(0, 5).map((patient, index) => (
          <button className="log-row" key={patient.id} onClick={() => onPatient(patient)}>
            <span className="patient-name"><i className={`patient-avatar ${patient.status}`}>{patient.initials}</i><b>{patient.name}</b></span>
            <span>{patient.checkIn}</span>
            <Badge tone={patient.status}>{patient.status === 'stable' ? 'Within personal baseline' : 'Slight deviation'}</Badge>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}

function SettingsPage({ onNotify }: { onNotify: (message: string) => void }) {
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="WORKSPACE PREFERENCES" title="Settings" subtitle="Manage your caregiver profile and notification preferences." />
      <div className="settings-grid">
        <div className="settings-panel">
          <PanelHeading icon={<Users />} title="Caregiver profile" copy="How your care team sees you." />
          <label>Full name<input value="Dr. Meera Sharma" readOnly /></label>
          <label>Role<input value="Lead caregiver" readOnly /></label>
          <button className="primary-button" onClick={() => onNotify('Profile changes are mocked for this prototype')}>Save changes</button>
        </div>
        <div className="settings-panel">
          <PanelHeading icon={<Bell />} title="Notifications" copy="Choose what needs your attention." />
          <Toggle label="SOS alerts" description="Immediate patient assistance requests" enabled />
          <Toggle label="Monitoring changes" description="Significant deviations from baseline" enabled />
          <Toggle label="Daily reminders" description="Incomplete patient assessments" enabled={false} />
          <button className="outline-button" onClick={() => onNotify('Alert preferences updated')}>Manage alert preferences</button>
        </div>
        <div className="settings-panel full-panel">
          <PanelHeading icon={<Clock3 />} title="Monitoring schedules" copy="Daily patient check-in windows." />
          <div className="schedule-row">
            <span><strong>Evening check-in</strong><small>Every day · 6:00 PM – 9:00 PM</small></span>
            <button className="outline-button" onClick={() => onNotify('Schedule editor opened')}>Edit schedule</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PanelHeading({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="panel-heading"><div className="setting-large-icon">{icon}</div><div><h2>{title}</h2><p>{copy}</p></div></div>
}

function Toggle({ label, description, enabled }: { label: string; description: string; enabled: boolean }) {
  return <div className="toggle-row"><span><strong>{label}</strong><small>{description}</small></span><button className={`toggle ${enabled ? 'on' : ''}`} aria-label={`Toggle ${label}`}><i /></button></div>
}

function NotificationPanel({ alerts, onClose, onOpen }: { alerts: SOSAlertApiData[]; onClose: () => void; onOpen: () => void }) {
  return (
    <div className="notification-panel">
      <div><strong>Notifications</strong><button onClick={onClose}><X size={16} /></button></div>
      {alerts.length > 0 ? (
        <button className="notification-item" onClick={onOpen}>
          <i className="notification-dot alert" />
          <span><b>New SOS alert ({alerts.length})</b><small>{alerts[0].patient_name} requested assistance</small></span>
          <ChevronRight size={15} />
        </button>
      ) : (
        <button className="notification-item" onClick={onOpen}>
          <i className="notification-dot stable" />
          <span><b>Emergency Alerts</b><small>No unresolved SOS emergency alerts</small></span>
          <ChevronRight size={15} />
        </button>
      )}
      <button className="notification-item" onClick={onClose}><i className="notification-dot attention" /><span><b>Monitoring change</b><small>Patient speech assessment needs review</small></span><ChevronRight size={15} /></button>
      <button className="notification-item" onClick={onClose}><i className="notification-dot stable" /><span><b>Daily reminder</b><small>Regular patient assessments in progress</small></span><ChevronRight size={15} /></button>
    </div>
  )
}

export default App