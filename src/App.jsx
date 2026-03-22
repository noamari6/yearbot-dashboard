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
const API_BASE = 'https://yearbot.noamaharonim.workers.dev';

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
  const apiRequest = useCallback(async (path, options) => {
    try {
      const data = await fetchJson(`${API_BASE}${path}`, options);
      setConnectionError('');
      return data;
    } catch (err) {
      const message = err?.message || 'Request failed';
      setConnectionError(message);
      throw err;
    }
  }, []);

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
    <div dir="rtl">
      {/* Header section with title and statistics */}
      <header className="dashboard-header">
        <h1>Yearbot Dashboard</h1>
        {connectionError && (
          <div className="connection-error">{connectionError}</div>
        )}
        <div className="stats">
          <div className="stat-card" title="מספר פניות פתוחות">
            <ClipboardList size={18} />
            <span>{summary?.open ?? 0}</span>
            <span>פתוחות</span>
          </div>
          <div className="stat-card" title="מספר פניות בבדיקה">
            <RefreshCw size={18} />
            <span>{summary?.investigating ?? 0}</span>
            <span>בבדיקה</span>
          </div>
          <div className="stat-card" title="מספר פניות סגורות">
            <CheckCircle2 size={18} />
            <span>{summary?.resolved ?? 0}</span>
            <span>סגורות</span>
          </div>
          <div className="stat-card" title="פניות דחופות">
            <AlertTriangle size={18} />
            <span>{summary?.high ?? 0}</span>
            <span>דחופות</span>
          </div>
        </div>
      </header>

      {/* Main layout: sidebar list and content details */}
      <div className="dashboard-main">
        <aside className="sidebar">
          {/* Filters and search */}
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="open">פתוחות</option>
            <option value="investigating">בבדיקה</option>
            <option value="resolved">סגורות</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
          >
            <option value="all">כל הדחיפויות</option>
            <option value="high">גבוהה</option>
            <option value="medium">בינונית</option>
            <option value="low">נמוכה</option>
          </select>
          {/* Incident list */}
          {loadingList ? (
            <p>טוען רשימה...</p>
          ) : (
            filteredIncidents.map((incident) => (
              <div
                key={incident.id}
                className={
                  'incident-item' + (selectedId === incident.id ? ' active' : '')
                }
                onClick={() => setSelectedId(incident.id)}
              >
                <div className="incident-item-header">
                  <p className="incident-item-title">{incident.title}</p>
                  <p style={{ fontSize: '0.75rem' }}>
                    {urgencyLabel[incident.urgency] || incident.urgency}
                  </p>
                </div>
                <div className="incident-item-subtitle">
                  {statusLabel[incident.status] || incident.status} ·{' '}
                  {categoryLabel[incident.category] || incident.category}
                </div>
              </div>
            ))
          )}
        </aside>
        <section className="content">
          {loadingDetails ? (
            <p>טוען פרטים...</p>
          ) : selectedIncident ? (
            <div className="detail-card">
              <h2>{selectedIncident.title}</h2>
              <p>
                <strong>סטטוס:</strong>{' '}
                {statusLabel[selectedIncident.status] || selectedIncident.status}
              </p>
              <p>
                <strong>דחיפות:</strong>{' '}
                {urgencyLabel[selectedIncident.urgency] || selectedIncident.urgency}
              </p>
              <p>
                <strong>תחום:</strong>{' '}
                {categoryLabel[selectedIncident.category] || selectedIncident.category}
              </p>
              <p>
                <strong>אחראי:</strong>{' '}
                {selectedIncident.assigned_to || 'לא הוקצה'}
              </p>
              <p>
                <strong>מספר הודעות:</strong> {selectedIncident.message_count}
              </p>
              <p>
                <strong>נוצר ב:</strong>{' '}
                {selectedIncident.created_at
                  ? new Date(selectedIncident.created_at).toLocaleString()
                  : '-'}
              </p>
              <p>
                <strong>עודכן לאחרונה:</strong>{' '}
                {selectedIncident.last_message_at
                  ? new Date(selectedIncident.last_message_at).toLocaleString()
                  : '-'}
              </p>
              {firstMessage && (
                <>
                  <h3>הודעה מקורית</h3>
                  <p>{firstMessage.text}</p>
                  {firstMessage.student_name && (
                    <p>
                      <strong>שם סטודנט:</strong> {firstMessage.student_name}
                    </p>
                  )}
                  {firstMessage.student_email && (
                    <p>
                      <strong>אימייל:</strong> {firstMessage.student_email}
                    </p>
                  )}
                  {firstMessage.student_phone && (
                    <p>
                      <strong>טלפון:</strong> {firstMessage.student_phone}
                    </p>
                  )}
                </>
              )}
              {/* Note textarea and action buttons */}
              <div className="actions">
                <button
                  className="primary"
                  disabled={saving}
                  onClick={() =>
                    runRepAction({ status: 'investigating', author: repName })
                  }
                >
                  קח לטיפול
                </button>
                <button
                  className="secondary"
                  disabled={saving || !noteText.trim()}
                  onClick={() =>
                    runRepAction({ note: noteText.trim(), author: repName })
                  }
                >
                  עדכון
                </button>
                <button
                  className="danger"
                  disabled={saving || !noteText.trim()}
                  onClick={() =>
                    runRepAction({
                      status: 'resolved',
                      note: noteText.trim(),
                      author: repName,
                    })
                  }
                >
                  סגור
                </button>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="הערה או עדכון לנציגים..."
              ></textarea>
              {error && <div className="error">{error}</div>}
            </div>
          ) : (
            <p>בחר פנייה כדי לראות את הפרטים.</p>
          )}
        </section>
      </div>
    </div>
  );
}
