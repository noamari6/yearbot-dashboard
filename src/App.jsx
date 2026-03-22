import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  RefreshCw,
  Clock3,
} from 'lucide-react';

/**
 * Yearbot Dashboard
 *
 * This component implements a simple management dashboard for the Yearbot service.
 * It pulls incident summary statistics, lists incidents with filters and search,
 * displays details for the selected incident and allows reps to take action on
 * incidents (assign/investigate, add a note/update, or resolve). Everything is
 * connected to the existing Cloudflare Worker API; there is no mock or local
 * fallback. The interface is intentionally kept lightweight and RTL-friendly.
 */

// Base URL for API requests – adjust this only if the backend endpoint changes.
// API base URL. Can be overridden by the user via the server input field.
const DEFAULT_API_BASE = 'https://yearbot.noamaharonim.workers.dev';

// Human‑readable labels for status, urgency and category codes.
const statusLabel = {
  open: 'פתוחה',
  investigating: 'בבדיקה',
  resolved: 'סגורה',
};

const urgencyLabel = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
};

const categoryLabel = {
  question: 'שאלה כללית',
  assignment: 'מטלה',
  exam: 'מבחן',
  grade: 'ציונים',
  schedule: 'מערכת שעות',
  technical: 'תקלה טכנית',
  administration: 'מינהלה',
  other: 'אחר',
};

// Utility to order incidents by urgency (high first, then medium, then low).
function urgencyOrder(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

// Helper for making JSON requests; throws on non‑2xx or non‑JSON responses.
async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const text = contentType.includes('application/json')
      ? JSON.stringify(await response.json())
      : await response.text();
    throw new Error(text || 'Request failed');
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Response is not JSON');
  }

  return response.json();
}

export default function App() {
  // Base URL for API requests. Defaults to the public Yearbot worker.
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  // Overall statistics returned by GET /incidents-summary
  const [summary, setSummary] = useState(null);
  // Raw list of incidents returned by GET /incidents
  const [incidents, setIncidents] = useState([]);
  // ID of the currently selected incident
  const [selectedId, setSelectedId] = useState(null);
  // Detailed information about the selected incident (GET /incidents/:id)
  const [selectedIncident, setSelectedIncident] = useState(null);
  // Loading state flags
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  // Client‑side filters and search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  // Note text for updates/resolution
  const [noteText, setNoteText] = useState('');
  // Rep name – this could be tied to authentication in the future
  const [repName, setRepName] = useState('Noam');
  // Saving flag for rep actions
  const [saving, setSaving] = useState(false);
  // Generic error message for form submissions
  const [error, setError] = useState('');
  // Connection or request error message
  const [connectionError, setConnectionError] = useState('');

  /**
   * Perform an API request relative to API_BASE.
   * Sets connectionError on failure and rethrows the error.
   */
  /**
   * Normalize the base URL by stripping any trailing slashes.
   */
  const normalizedBase = useMemo(() => {
    return String(apiBase || '').trim().replace(/\/+\$/, '');
  }, [apiBase]);

  /**
   * Perform an API request relative to the current base. Sets
   * connectionError on failure and rethrows the error.
   */
  const apiRequest = useCallback(
    async (path, options) => {
      try {
        const data = await fetchJson(`${normalizedBase}${path}`, options);
        setConnectionError('');
        return data;
      } catch (err) {
        const message = err?.message || 'Request failed';
        // Distinguish between generic fetch errors and server errors
        if (message.includes('Failed to fetch')) {
          setConnectionError(
            'לא הצלחנו להגיע לשרת. בדוק שהכתובת נכונה ושמוגדר CORS ב־Worker.',
          );
        } else {
          setConnectionError(message);
        }
        throw err;
      }
    },
    [normalizedBase],
  );

  /**
   * Load incident summary from the backend.
   */
  const loadSummary = useCallback(async () => {
    try {
      const data = await apiRequest('/incidents-summary');
      setSummary(data.summary || null);
    } catch {
      setSummary(null);
    }
  }, [apiRequest]);

  /**
   * Load the list of incidents, applying the status filter on the server.
   */
  const loadIncidents = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const path =
        statusFilter === 'all' ? '/incidents' : `/incidents?status=${statusFilter}`;
      const data = await apiRequest(path);
      const rows = Array.isArray(data.incidents) ? data.incidents : [];
      setIncidents(rows);
      // Preserve selection if the incident is still in the list; otherwise select first.
      if (rows.length === 0) {
        setSelectedId(null);
        setSelectedIncident(null);
      } else {
        setSelectedId((current) =>
          current && rows.some((row) => row.id === current) ? current : rows[0].id,
        );
      }
    } catch {
      setIncidents([]);
      setSelectedId(null);
      setSelectedIncident(null);
      setError('לא הצלחנו לטעון את רשימת הפניות');
    } finally {
      setLoadingList(false);
    }
  }, [apiRequest, statusFilter]);

  /**
   * Load detailed information about a single incident by ID.
   */
  const loadIncidentDetails = useCallback(
    async (id) => {
      if (!id) {
        setSelectedIncident(null);
        return;
      }
      setLoadingDetails(true);
      setError('');
      try {
        const data = await apiRequest(`/incidents/${id}`);
        setSelectedIncident(data);
      } catch {
        setSelectedIncident(null);
        setError('לא הצלחנו לטעון את פרטי הפנייה');
      } finally {
        setLoadingDetails(false);
      }
    },
    [apiRequest],
  );

  // On mount and whenever the summary or list filters change, reload data.
  useEffect(() => {
    loadSummary();
    loadIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSummary, loadIncidents]);

  // When the selected ID changes, load details.
  useEffect(() => {
    if (selectedId) {
      loadIncidentDetails(selectedId);
    }
  }, [selectedId, loadIncidentDetails]);

  /**
   * Refresh both summary and incident list. Useful for manual refresh
   * triggered by the user via the refresh button.
   */
  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadIncidents()]);
  }, [loadSummary, loadIncidents]);

  // Filter and sort incidents client‑side for search and urgency filter.
  const filteredIncidents = useMemo(() => {
    return [...incidents]
      .filter((incident) => {
        if (urgencyFilter !== 'all' && incident.urgency !== urgencyFilter) {
          return false;
        }
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          String(incident.title || '').toLowerCase().includes(q) ||
          String(incident.assigned_to || '').toLowerCase().includes(q) ||
          String(categoryLabel[incident.category] || incident.category || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .sort((a, b) => {
        const urgencyDiff = urgencyOrder(b.urgency) - urgencyOrder(a.urgency);
        if (urgencyDiff !== 0) return urgencyDiff;
        return (
          new Date(b.last_message_at || 0).getTime() -
          new Date(a.last_message_at || 0).getTime()
        );
      });
  }, [incidents, urgencyFilter, search]);

  // Extract the first message from the selected incident for display.
  const firstMessage = selectedIncident?.messages?.[0] || null;

  /**
   * Execute a rep action by sending a POST /rep-action request. After the
   * request completes, refresh the summary, list and details. Clears the note
   * text upon success.
   */
  async function runRepAction(payload) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest('/rep-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: selectedId, ...payload }),
      });
      setNoteText('');
      await Promise.all([
        loadSummary(),
        loadIncidents(),
        loadIncidentDetails(selectedId),
      ]);
    } catch {
      setError('הפעולה לא הושלמה. כדאי לנסות שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="dashboard-container">
      {/* Header with title, tagline, rep name input and refresh */}
      <header className="header">
        <div className="header-left">
          <h1 className="title">Yearbot Dashboard</h1>
          <p className="tagline">ניהול פניות נציגות בצורה מהירה, נעימה וברורה.</p>
        </div>
        <div className="header-right">
          <input
            className="rep-input"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            placeholder="שם נציג"
          />
          <button
            className="refresh-button"
            disabled={loadingList || saving}
            onClick={refreshAll}
            title="רענון"
          >
            <RefreshCw size={16} /> רענן
          </button>
        </div>
      </header>

      {/* Server address row */}
      <div className="server-row">
        <div className="server-input-wrapper">
          <label className="server-label" htmlFor="apiBase">כתובת השרת</label>
          <input
            id="apiBase"
            dir="ltr"
            className="server-input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="https://yearbot.noamaharonim.workers.dev"
          />
        </div>
        {connectionError && <div className="connection-error">{connectionError}</div>}
      </div>

      {/* Summary statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><ClipboardList size={20} /></div>
          <div className="stat-info">
            <div className="stat-value">{summary?.open ?? '-'}</div>
            <div className="stat-label">פתוחות</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock3 size={20} /></div>
          <div className="stat-info">
            <div className="stat-value">{summary?.investigating ?? '-'}</div>
            <div className="stat-label">בבדיקה</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><CheckCircle2 size={20} /></div>
          <div className="stat-info">
            <div className="stat-value">{summary?.resolved ?? '-'}</div>
            <div className="stat-label">סגורות</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><AlertTriangle size={20} /></div>
          <div className="stat-info">
            <div className="stat-value">{summary?.high ?? '-'}</div>
            <div className="stat-label">דחופות</div>
          </div>
        </div>
      </div>

      {/* Main grid layout */}
      <div className="main-grid">
        <aside className="sidebar">
          {/* Search input */}
          <div className="filter-row">
            <input
              className="search-input"
              type="text"
              placeholder="חיפוש לפי נושא, תחום או נציג"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Status filter tabs */}
          <div className="tabs-row">
            {['all','open','investigating','resolved'].map((val) => (
              <button
                key={val}
                className={`tab-item${statusFilter === val ? ' active' : ''}`}
                onClick={() => setStatusFilter(val)}
              >
                {val === 'all' ? 'הכל' : statusLabel[val] || val}
              </button>
            ))}
          </div>
          {/* Urgency select */}
          <div className="filter-row">
            <select
              className="select-input"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="all">כל הדחיפויות</option>
              <option value="high">גבוהה</option>
              <option value="medium">בינונית</option>
              <option value="low">נמוכה</option>
            </select>
          </div>
          {/* Incident list */}
          <div className="incident-list">
            {loadingList && <div className="loading-state">טוען פניות...</div>}
            {!loadingList && filteredIncidents.length === 0 && <div className="empty-state">אין פניות שתואמות לסינון שבחרת</div>}
            {!loadingList && filteredIncidents.map((incident) => {
              const active = selectedId === incident.id;
              return (
                <div
                  key={incident.id}
                  className={`incident-card${active ? ' active' : ''}`}
                  onClick={() => setSelectedId(incident.id)}
                >
                  <div className="incident-badges">
                    <span className={`badge status-${incident.status}`}>{statusLabel[incident.status] || incident.status}</span>
                    <span className={`badge urgency-${incident.urgency}`}>{urgencyLabel[incident.urgency] || incident.urgency}</span>
                  </div>
                  <div className="incident-title">{incident.title}</div>
                  <div className="incident-meta">{categoryLabel[incident.category] || incident.category} · {incident.message_count} פניות</div>
                  <div className="incident-id">#{incident.id}</div>
                </div>
              );
            })}
          </div>
        </aside>
        <div className="content-area">
          {error && <div className="error-block">{error}</div>}
          {!selectedId && !loadingDetails && <div className="empty-state">בחר פנייה מהרשימה כדי לראות פרטים</div>}
          {loadingDetails && selectedId && <div className="loading-state">טוען פרטי פנייה...</div>}
          {!loadingDetails && selectedIncident && (
            <div className="details-container">
              {/* Incident info cards */}
              <div className="detail-card subject-card">
                <div className="subject-header">
                  <h2 className="subject-title">{selectedIncident.title}</h2>
                </div>
                <div className="info-pills">
                  <span className="info-pill"><strong>מספר פנייה:</strong> #{selectedIncident.id}</span>
                  <span className="info-pill"><strong>תחום:</strong> {categoryLabel[selectedIncident.category] || selectedIncident.category}</span>
                  <span className="info-pill"><strong>פניות קשורות:</strong> {selectedIncident.message_count}</span>
                  <span className="info-pill"><strong>אחראי:</strong> {selectedIncident.assigned_to || 'טרם שויך'}</span>
                </div>
                {firstMessage && (
                  <div className="original-message">
                    <div className="original-title">הודעה מקורית</div>
                    <p className="original-content">{firstMessage.text}</p>
                  </div>
                )}
              </div>
              <div className="detail-card student-card">
                <div className="student-header">פרטי סטודנט</div>
                <div className="mini-info"><span className="mini-label">שם</span><span className="mini-value">{firstMessage?.student_name || firstMessage?.user || 'לא ידוע'}</span></div>
                <div className="mini-info"><span className="mini-label">מייל</span><span className="mini-value">{firstMessage?.student_email || 'לא הוזן'}</span></div>
                <div className="mini-info"><span className="mini-label">טלפון</span><span className="mini-value">{firstMessage?.student_phone || 'לא הוזן'}</span></div>
                {firstMessage && (
                  <div className="draft-reply">
                    <div className="draft-title">טיוטת תשובה לסטודנט</div>
                    <p className="draft-content">{firstMessage.student_reply_draft || 'עדיין לא נוצרה טיוטת תשובה'}</p>
                  </div>
                )}
              </div>
              <div className="detail-card actions-card">
                <div className="actions-row">
                  <button
                    className="action-button primary"
                    disabled={saving}
                    onClick={() => runRepAction({ assigned_to: repName, status: 'investigating' })}
                  >
                    קח לטיפול
                  </button>
                  <button
                    className="action-button secondary"
                    disabled={saving}
                    onClick={() => runRepAction({ status: 'investigating' })}
                  >
                    סמן בבדיקה
                  </button>
                  <button
                    className="action-button outline"
                    disabled={saving}
                    onClick={() => runRepAction({ status: 'resolved' })}
                  >
                    סגור פנייה
                  </button>
                </div>
                <div className="add-note">
                  <textarea
                    className="note-input"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="כתוב כאן עדכון שיישמר בהערות הטיפול"
                  ></textarea>
                  <button
                    className="save-note-button"
                    disabled={saving || !noteText.trim()}
                    onClick={() => runRepAction({ author: repName, note: noteText.trim() })}
                  >
                    שמור עדכון
                  </button>
                </div>
              </div>
              <div className="detail-card notes-card">
                <div className="notes-header">הערות טיפול</div>
                <div className="notes-list">
                  {(selectedIncident.notes || []).length === 0 && <div className="empty-state">עדיין אין הערות על הפנייה הזו</div>}
                  {(selectedIncident.notes || []).map((note) => (
                    <div key={note.id} className="note-item">
                      <div className="note-meta">
                        <span className="note-author">{note.author}</span>
                        <span className="note-date">{note.created_at}</span>
                      </div>
                      <div className="note-content">{note.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
