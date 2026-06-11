import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

function formatCurrency(n) {
  return Number(n).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Properties() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', city: '', unitCount: 1, notes: '' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
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

  async function fetchProperties() {
    try {
      setLoading(true);
      const res = await api.get('/properties');
      setProperties(res.data.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل تحميل العقارات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProperties(); }, []);

  function openAdd() {
    setEditing(null);
    setForm({ name: '', city: '', unitCount: 1, notes: '' });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({ name: p.name, city: p.city, unitCount: p.unitCount || 1, notes: p.notes || '' });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) { setFormError('اسم العقار مطلوب'); return; }
    if (!form.city.trim()) { setFormError('المدينة مطلوبة'); return; }
    if (!form.unitCount || form.unitCount < 1 || form.unitCount > 100) { setFormError('عدد الوحدات يجب أن يكون بين 1 و 100'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/properties/${editing.id}`, { name: form.name, city: form.city, notes: form.notes });
        showToast('✓ تم تحديث العقار بنجاح');
      } else {
        await api.post('/properties', { name: form.name, city: form.city, unitCount: form.unitCount, notes: form.notes });
        showToast('✓ تم إضافة العقار بنجاح');
      }
      setShowModal(false);
      await fetchProperties();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ العقار');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteConfirm !== 'حذف') { return; }
    try {
      await api.delete(`/properties/${deleteTarget.id}`, { data: { confirm: 'حذف' } });
      showToast(`✓ تم حذف العقار "${deleteTarget.name}"`);
      setDeleteTarget(null);
      setDeleteConfirm('');
      await fetchProperties();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل حذف العقار', 'error');
      setDeleteTarget(null);
      setDeleteConfirm('');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h2>العقارات</h2></div>
        <div className="table-wrapper">
          {[1,2,3].map(i => <div key={i} className="skeleton-row"><div className="skeleton-cell" /><div className="skeleton-cell" /><div className="skeleton-cell" /></div>)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-primary" onClick={fetchProperties}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>العقارات</h2>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openAdd}>+ إضافة عقار</button>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <p className="empty-state-text">لا توجد عقارات مسجلة بعد</p>
          <button className="btn btn-primary" onClick={openAdd}>إضافة أول عقار</button>
        </div>
      ) : (
        <div className="card-grid">
          {properties.map(p => (
            <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/properties/${p.id}`)}>
              <div className="card-header">
                <div>
                  <div className="card-title">{p.name}</div>
                  <div className="card-subtitle">{p.city}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="تعديل">✎</button>
                  <button className="btn-icon danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); setDeleteConfirm(''); }} title="حذف">🗑</button>
                </div>
              </div>
              <div className="detail-grid" style={{ marginBottom: 0 }}>
                <div className="detail-item">
                  <span className="detail-label">الوحدات</span>
                  <span className="detail-value">{p.unitCount}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">مشغول</span>
                  <span className="detail-value">{p.occupiedCount || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">شاغر</span>
                  <span className="detail-value">{(p.unitCount || 0) - (p.occupiedCount || 0)}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                <span className="badge badge-blue">{((p.occupiedCount || 0) / (p.unitCount || 1) * 100).toFixed(0)}% إشغال</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل العقار' : 'إضافة عقار جديد'}>
        <form onSubmit={handleSave} className="form-layout">
          <div className="form-group">
            <label className="form-label">اسم العقار</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: عمارة الخليج" required />
          </div>
          <div className="form-group">
            <label className="form-label">المدينة</label>
            <input className="form-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="مثال: الرياض" required />
          </div>
          {!editing && (
            <div className="form-group">
              <label className="form-label">عدد الوحدات</label>
              <input className="form-input" type="number" min="1" max="100" value={form.unitCount} onChange={e => setForm({ ...form, unitCount: parseInt(e.target.value) || 1 })} required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">ملاحظات (اختياري)</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : editing ? 'حفظ التغييرات' : 'إضافة العقار'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">⚠️</div>
            <div className="confirm-title">حذف العقار</div>
            <div className="confirm-text">
              هل أنت متأكد من حذف العقار <strong>{deleteTarget.name}</strong>؟
              <br />سيتم حذف جميع الوحدات والبيانات المرتبطة.
              <br /><br />
              اكتب كلمة <strong>"حذف"</strong> لتأكيد الحذف:
            </div>
            <input className="form-input" style={{ marginBottom: 16, textAlign: 'center' }} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="حذف" autoFocus />
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>إلغاء</button>
              <button className="btn btn-danger" disabled={deleteConfirm !== 'حذف'} onClick={handleDelete}>حذف العقار</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
