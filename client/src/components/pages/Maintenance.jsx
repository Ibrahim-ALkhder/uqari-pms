import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

const URGENCY_LABELS = { Emergency: 'طارئ', High: 'عالي', Medium: 'متوسط', Low: 'منخفض' };
const URGENCY_CLASSES = { Emergency: 'badge-red', High: 'badge-orange', Medium: 'badge-yellow', Low: 'badge-gray' };
const STATUS_LABELS = { Open: 'مفتوحة', InProgress: 'قيد التنفيذ', Resolved: 'تم الحل' };
const STATUS_CLASSES = { Open: 'badge-red', InProgress: 'badge-blue', Resolved: 'badge-green' };

export default function Maintenance() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({ unitId: '', reportedBy: '', description: '', urgency: 'Medium' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  async function fetchTickets() {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (urgencyFilter) params.urgency = urgencyFilter;
      const res = await api.get('/maintenance', { params });
      setTickets(res.data.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل تحميل تذاكر الصيانة');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTickets(); }, [statusFilter, urgencyFilter]);

  async function openAdd() {
    setShowModal(true);
    setEditing(null);
    setForm({ unitId: '', reportedBy: '', description: '', urgency: 'Medium' });
    setFormError(null);
    if (units.length === 0) {
      try {
        const res = await api.get('/units');
        setUnits(res.data.data);
      } catch { /* ignore */ }
    }
  }

  function openEdit(t) {
    setEditing(t);
    setForm({ unitId: String(t.unitId), reportedBy: t.reportedBy, description: t.description, urgency: t.urgency });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.unitId) { setFormError('الوحدة مطلوبة'); return; }
    if (!form.reportedBy.trim()) { setFormError('اسم المبلغ مطلوب'); return; }
    if (!form.description.trim() || form.description.trim().length < 10) { setFormError('وصف المشكلة يجب أن يكون 10 أحرف على الأقل'); return; }
    setSaving(true);
    try {
      const body = { unitId: Number(form.unitId), reportedBy: form.reportedBy, description: form.description, urgency: form.urgency };
      if (editing) {
        await api.patch(`/maintenance/${editing.id}`, body);
        showToast('✓ تم تحديث التذكرة');
      } else {
        await api.post('/maintenance', body);
        showToast('✓ تم إنشاء تذكرة الصيانة');
      }
      setShowModal(false);
      await fetchTickets();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(t) {
    if (!window.confirm(`تأكيد حل المشكلة: "${t.description.slice(0, 50)}…"؟`)) return;
    try {
      await api.patch(`/maintenance/${t.id}/resolve`);
      showToast(`✓ تم تأكيد حل المشكلة`);
      await fetchTickets();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل', 'error');
    }
  }

  async function handleStatusChange(t, newStatus) {
    try {
      await api.patch(`/maintenance/${t.id}`, { status: newStatus });
      showToast(`✓ تم تغيير الحالة إلى ${STATUS_LABELS[newStatus]}`);
      await fetchTickets();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل', 'error');
    }
  }

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>الصيانة</h2>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openAdd}>+ تذكرة جديدة</button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">جميع الحالات</option>
          <option value="Open">مفتوحة</option>
          <option value="InProgress">قيد التنفيذ</option>
          <option value="Resolved">تم الحل</option>
        </select>
        <select className="form-select" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
          <option value="">جميع الأولويات</option>
          <option value="Emergency">طارئ</option>
          <option value="High">عالي</option>
          <option value="Medium">متوسط</option>
          <option value="Low">منخفض</option>
        </select>
      </div>

      {loading ? (
        <div className="table-wrapper">
          {[1,2,3].map(i => <div key={i} className="skeleton-row"><div className="skeleton-cell" /><div className="skeleton-cell" /><div className="skeleton-cell" /></div>)}
        </div>
      ) : error ? (
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-primary" onClick={fetchTickets}>إعادة المحاولة</button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <p className="empty-state-text">لا توجد تذاكر صيانة</p>
          <button className="btn btn-primary" onClick={openAdd}>إنشاء أول تذكرة</button>
        </div>
      ) : (
        <div className="card-grid">
          {tickets.map(t => (
            <div key={t.id} className="card" style={{ borderRight: `4px solid ${
              t.urgency === 'Emergency' ? '#f87171' : t.urgency === 'High' ? '#fb923c' : t.urgency === 'Medium' ? '#fbbf24' : '#64748b'
            }` }}>
              <div className="card-header" style={{ marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span className={`badge ${URGENCY_CLASSES[t.urgency]}`}>{URGENCY_LABELS[t.urgency]}</span>
                    <span className={`badge ${STATUS_CLASSES[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </div>
                  <div className="card-title" style={{ fontSize: 14 }}>
                    {t.propertyName} — {t.unitNumber}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>{t.description}</p>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                المبلغ: {t.reportedBy} | {t.createdAt?.slice(0, 10) || ''}
                {t.resolvedAt && <> | تم الحل: {t.resolvedAt}</>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {t.status !== 'Resolved' && (
                  <>
                    {t.status === 'Open' && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleStatusChange(t, 'InProgress')}>بدء التنفيذ</button>
                    )}
                    {t.status === 'InProgress' && (
                      <button className="btn btn-sm btn-primary" onClick={() => handleResolve(t)}>تم الحل</button>
                    )}
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(t)}>تعديل</button>
                  </>
                )}
                {t.status === 'Open' && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleResolve(t)}>حل سريع</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل التذكرة' : 'تذكرة صيانة جديدة'}>
        <form onSubmit={handleSave} className="form-layout">
          <div className="form-group">
            <label className="form-label">الوحدة</label>
            <select className="form-select" value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })} required>
              <option value="">اختر الوحدة…</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber} - {u.propertyName}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">المبلغ</label>
              <input className="form-input" value={form.reportedBy} onChange={e => setForm({ ...form, reportedBy: e.target.value })} placeholder="اسم الشخص المبلغ" required />
            </div>
            <div className="form-group">
              <label className="form-label">مستوى الاستعجال</label>
              <select className="form-select" value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })}>
                {Object.entries(URGENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">وصف المشكلة</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="وصف تفصيلي للمشكلة" required />
          </div>
          {editing && (
            <div className="form-group">
              <label className="form-label">الحالة</label>
              <select className="form-select" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                <option value="Open">مفتوحة</option>
                <option value="InProgress">قيد التنفيذ</option>
                <option value="Resolved">تم الحل</option>
              </select>
            </div>
          )}
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري…' : editing ? 'حفظ التغييرات' : 'إنشاء التذكرة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
