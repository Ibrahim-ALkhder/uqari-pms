import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

const UNIT_TYPE_LABELS = { Apartment: 'شقة', Shop: 'محل', Room: 'غرفة', Villa: 'فيلا', Studio: 'استوديو' };
const STATUS_LABELS = { Vacant: 'شاغرة', Occupied: 'مؤجرة', UnderMaintenance: 'تحت الصيانة' };
const STATUS_CLASSES = { Vacant: 'badge-gray', Occupied: 'badge-green', UnderMaintenance: 'badge-yellow' };

export default function PropertyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', city: '', notes: '' });
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editUnit, setEditUnit] = useState(null);
  const [unitForm, setUnitForm] = useState({ unitNumber: '', type: 'Apartment', floor: '', monthlyRent: '', status: 'Vacant' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
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

  async function fetchProperty() {
    try {
      setLoading(true);
      const res = await api.get(`/properties/${id}`);
      setProperty(res.data.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) { setError('العقار غير موجود'); return; }
      setError(err.response?.data?.message || 'فشل تحميل بيانات العقار');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProperty(); }, [id]);

  function openEditProperty() {
    setEditForm({ name: property.name, city: property.city, notes: property.notes || '' });
    setFormError(null);
    setShowEdit(true);
  }

  async function handleEditProperty(e) {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.city.trim()) { setFormError('جميع الحقول المطلوبة'); return; }
    setSaving(true);
    try {
      await api.put(`/properties/${id}`, editForm);
      showToast('✓ تم تحديث بيانات العقار');
      setShowEdit(false);
      await fetchProperty();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل التحديث');
    } finally {
      setSaving(false);
    }
  }

  function openAddUnit() {
    setEditUnit(null);
    setUnitForm({ unitNumber: '', type: 'Apartment', floor: '', monthlyRent: '', status: 'Vacant' });
    setFormError(null);
    setShowUnitModal(true);
  }

  function openEditUnit(u) {
    setEditUnit(u);
    setUnitForm({ unitNumber: u.unitNumber, type: u.type, floor: u.floor || '', monthlyRent: String(u.monthlyRent || ''), status: u.status });
    setFormError(null);
    setShowUnitModal(true);
  }

  async function handleSaveUnit(e) {
    e.preventDefault();
    setFormError(null);
    if (!unitForm.unitNumber.trim()) { setFormError('رقم الوحدة مطلوب'); return; }
    if (!unitForm.monthlyRent || unitForm.monthlyRent < 0) { setFormError('الإيجار الشهري مطلوب'); return; }
    setSaving(true);
    try {
      const body = {
        propertyId: Number(id),
        unitNumber: unitForm.unitNumber,
        type: unitForm.type,
        floor: unitForm.floor || null,
        monthlyRent: Number(unitForm.monthlyRent),
        status: unitForm.status,
      };
      if (editUnit) {
        await api.put(`/units/${editUnit.id}`, body);
        showToast('✓ تم تحديث الوحدة');
      } else {
        await api.post('/units', body);
        showToast('✓ تم إضافة الوحدة');
      }
      setShowUnitModal(false);
      await fetchProperty();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ الوحدة');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUnit(unit) {
    if (!window.confirm(`هل أنت متأكد من حذف "${unit.unitNumber}"؟`)) return;
    try {
      await api.delete(`/units/${unit.id}`);
      showToast(`✓ تم حذف ${unit.unitNumber}`);
      await fetchProperty();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل الحذف', 'error');
    }
  }

  async function handleToggleUnitStatus(unit) {
    const newStatus = unit.status === 'Occupied' ? 'UnderMaintenance' : unit.status === 'UnderMaintenance' ? 'Vacant' : 'Occupied';
    try {
      await api.patch(`/units/${unit.id}/status`, { status: newStatus });
      showToast(`✓ تم تغيير حالة ${unit.unitNumber} إلى ${STATUS_LABELS[newStatus]}`);
      await fetchProperty();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل تغيير الحالة', 'error');
    }
  }

  if (loading) {
    return <div className="page"><div className="loading-state"><div className="loading-spinner" /><p>جاري التحميل…</p></div></div>;
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/properties')}>العودة إلى العقارات</button>
        </div>
      </div>
    );
  }

  const units = property?.units || [];

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="page-header">
        <div>
          <h2>{property.name}</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>{property.city}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/properties')}>← العقارات</button>
          <button className="btn btn-primary" onClick={openEditProperty}>تعديل العقار</button>
          <button className="btn btn-success" onClick={openAddUnit}>+ إضافة وحدة</button>
        </div>
      </div>

      {/* Property Details */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">اسم العقار</span>
            <span className="detail-value">{property.name}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">المدينة</span>
            <span className="detail-value">{property.city}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">إجمالي الوحدات</span>
            <span className="detail-value">{units.length}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">الوحدات المؤجرة</span>
            <span className="detail-value">{units.filter(u => u.status === 'Occupied').length}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">نسبة الإشغال</span>
            <span className="detail-value">{units.length > 0 ? Math.round(units.filter(u => u.status === 'Occupied').length / units.length * 100) : 0}%</span>
          </div>
          {property.notes && (
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <span className="detail-label">ملاحظات</span>
              <span className="detail-value">{property.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Units */}
      <h3 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>الوحدات ({units.length})</h3>

      {units.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏠</div>
          <p className="empty-state-text">لا توجد وحدات في هذا العقار</p>
          <button className="btn btn-primary" onClick={openAddUnit}>إضافة أول وحدة</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم الوحدة</th>
                <th>النوع</th>
                <th>الدور</th>
                <th>الإيجار الشهري</th>
                <th>الحالة</th>
                <th>المستأجر</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.unitNumber}</td>
                  <td className="cell-muted">{UNIT_TYPE_LABELS[u.type] || u.type}</td>
                  <td className="cell-muted">{u.floor || '—'}</td>
                  <td className="cell-number">{Number(u.monthlyRent).toLocaleString('ar-SA')}</td>
                  <td><span className={`badge ${STATUS_CLASSES[u.status]}`}>{STATUS_LABELS[u.status]}</span></td>
                  <td>{u.tenantName || <span style={{ color: '#64748b' }}>—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn-icon" onClick={() => openEditUnit(u)} title="تعديل">✎</button>
                      <button className="btn-icon" onClick={() => handleToggleUnitStatus(u)} title="تغيير الحالة">🔄</button>
                      <button className="btn-icon danger" onClick={() => handleDeleteUnit(u)} title="حذف">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Property Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="تعديل العقار">
        <form onSubmit={handleEditProperty} className="form-layout">
          <div className="form-group">
            <label className="form-label">اسم العقار</label>
            <input className="form-input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">المدينة</label>
            <input className="form-input" value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea className="form-textarea" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : 'حفظ التغييرات'}</button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit Unit Modal */}
      <Modal open={showUnitModal} onClose={() => setShowUnitModal(false)} title={editUnit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}>
        <form onSubmit={handleSaveUnit} className="form-layout">
          <div className="form-group">
            <label className="form-label">رقم الوحدة</label>
            <input className="form-input" value={unitForm.unitNumber} onChange={e => setUnitForm({ ...unitForm, unitNumber: e.target.value })} placeholder="مثال: وحدة 5" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">النوع</label>
              <select className="form-select" value={unitForm.type} onChange={e => setUnitForm({ ...unitForm, type: e.target.value })}>
                {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">الدور</label>
              <input className="form-input" type="number" value={unitForm.floor} onChange={e => setUnitForm({ ...unitForm, floor: e.target.value })} placeholder="اختياري" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">الإيجار الشهري (ريال)</label>
              <input className="form-input" type="number" min="0" value={unitForm.monthlyRent} onChange={e => setUnitForm({ ...unitForm, monthlyRent: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">الحالة</label>
              <select className="form-select" value={unitForm.status} onChange={e => setUnitForm({ ...unitForm, status: e.target.value })}>
                <option value="Vacant">شاغرة</option>
                <option value="Occupied">مؤجرة</option>
                <option value="UnderMaintenance">تحت الصيانة</option>
              </select>
            </div>
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowUnitModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : editUnit ? 'حفظ التغييرات' : 'إضافة الوحدة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
