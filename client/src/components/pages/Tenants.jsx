import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

export default function Tenants() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ fullName: '', phone: '', secondaryPhone: '', nationalId: '', notes: '' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
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

  async function fetchTenants() {
    try {
      setLoading(true);
      const params = { status: statusFilter };
      if (search.trim().length >= 2) params.search = search.trim();
      const res = await api.get('/tenants', { params });
      setTenants(res.data.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل تحميل المستأجرين');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTenants(); }, [statusFilter]);

  useEffect(() => {
    if (search.trim().length >= 2 || search.trim().length === 0) {
      const timer = setTimeout(fetchTenants, 300);
      return () => clearTimeout(timer);
    }
  }, [search]);

  function openAdd() {
    setEditing(null);
    setForm({ fullName: '', phone: '', secondaryPhone: '', nationalId: '', notes: '' });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({ fullName: t.fullName, phone: t.phone || '', secondaryPhone: t.secondaryPhone || '', nationalId: t.nationalId || '', notes: t.notes || '' });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.fullName.trim()) { setFormError('الاسم مطلوب'); return; }
    if (!form.phone.trim() || form.phone.trim().length < 7) { setFormError('رقم الجوال مطلوب (7 أرقام على الأقل)'); return; }
    setSaving(true);
    try {
      const body = {
        fullName: form.fullName,
        phone: form.phone,
        secondaryPhone: form.secondaryPhone || undefined,
        nationalId: form.nationalId || undefined,
        notes: form.notes || undefined,
      };
      if (editing) {
        await api.put(`/tenants/${editing.id}`, body);
        showToast('✓ تم تحديث بيانات المستأجر');
      } else {
        await api.post('/tenants', body);
        showToast('✓ تم تسجيل المستأجر بنجاح');
      }
      setShowModal(false);
      await fetchTenants();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ المستأجر');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t) {
    if (!window.confirm(`هل أنت متأكد من نقل "${t.fullName}" إلى المستأجرين السابقين؟`)) return;
    try {
      await api.delete(`/tenants/${t.id}`);
      showToast(`✓ تم نقل ${t.fullName} إلى المستأجرين السابقين`);
      await fetchTenants();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل الحذف', 'error');
    }
  }

  async function viewDetails(t) {
    try {
      const res = await api.get(`/tenants/${t.id}`);
      setSelectedTenant(res.data.data);
    } catch (err) {
      showToast('فشل تحميل التفاصيل', 'error');
    }
  }

  if (loading && !tenants.length) {
    return (
      <div className="page">
        <div className="page-header"><h2>المستأجرون</h2></div>
        <div className="table-wrapper">
          {[1,2,3,4].map(i => <div key={i} className="skeleton-row"><div className="skeleton-cell" /><div className="skeleton-cell" /><div className="skeleton-cell" /></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>المستأجرون</h2>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openAdd}>+ إضافة مستأجر</button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="form-input search-input" placeholder="بحث بالاسم…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="active">نشطون</option>
          <option value="former">سابقون</option>
        </select>
      </div>

      {error && (
        <div className="error-state" style={{ padding: 20 }}>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-primary" onClick={fetchTenants}>إعادة المحاولة</button>
        </div>
      )}

      {!error && tenants.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <p className="empty-state-text">{statusFilter === 'active' ? 'لا يوجد مستأجرون نشطون' : 'لا يوجد مستأجرون سابقون'}</p>
          {statusFilter === 'active' && <button className="btn btn-primary" onClick={openAdd}>إضافة أول مستأجر</button>}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الجوال</th>
                <th>الوحدة</th>
                <th>العقار</th>
                <th>حالة العقد</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => viewDetails(t)}>
                  <td style={{ fontWeight: 600 }}>{t.fullName}</td>
                  <td className="cell-muted" dir="ltr" style={{ textAlign: 'right' }}>{t.phone}</td>
                  <td className="cell-muted">{t.unitNumber || '—'}</td>
                  <td className="cell-muted">{t.propertyName || '—'}</td>
                  <td>
                    {t.contractStatus === 'Active' ? <span className="badge badge-green">نشط</span>
                    : t.isFormer ? <span className="badge badge-gray">سابق</span>
                    : <span className="badge badge-gray">لا يوجد</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn-icon" onClick={() => openEdit(t)} title="تعديل">✎</button>
                      {!t.isFormer && <button className="btn-icon danger" onClick={() => handleDelete(t)} title="نقل للسابقين">🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل المستأجر' : 'إضافة مستأجر جديد'}>
        <form onSubmit={handleSave} className="form-layout">
          <div className="form-group">
            <label className="form-label">الاسم الكامل</label>
            <input className="form-input" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="مثال: أحمد محمد" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">رقم الجوال</label>
              <input className="form-input" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" required />
            </div>
            <div className="form-group">
              <label className="form-label">جوال آخر (اختياري)</label>
              <input className="form-input" dir="ltr" value={form.secondaryPhone} onChange={e => setForm({ ...form, secondaryPhone: e.target.value })} placeholder="05xxxxxxxx" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">رقم الهوية (اختياري)</label>
              <input className="form-input" value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} placeholder="رقم الهوية" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">ملاحظات (اختياري)</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : editing ? 'حفظ التغييرات' : 'إضافة المستأجر'}</button>
          </div>
        </form>
      </Modal>

      {/* Details Modal */}
      {selectedTenant && (
        <Modal open={true} onClose={() => setSelectedTenant(null)} title={selectedTenant.fullName}>
          <div className="form-layout">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">الجوال</span>
                <span className="detail-value" dir="ltr" style={{ textAlign: 'right' }}>{selectedTenant.phone}</span>
              </div>
              {selectedTenant.secondaryPhone && (
                <div className="detail-item">
                  <span className="detail-label">جوال آخر</span>
                  <span className="detail-value" dir="ltr" style={{ textAlign: 'right' }}>{selectedTenant.secondaryPhone}</span>
                </div>
              )}
              {selectedTenant.nationalId && (
                <div className="detail-item">
                  <span className="detail-label">رقم الهوية</span>
                  <span className="detail-value">{selectedTenant.nationalId}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">الحالة</span>
                <span className="detail-value">{selectedTenant.isFormer ? 'سابق' : 'نشط'}</span>
              </div>
            </div>

            {selectedTenant.notes && <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>{selectedTenant.notes}</p>}

            {selectedTenant.contracts?.length > 0 && (
              <>
                <h4 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 10, marginTop: 8 }}>العقود</h4>
                {selectedTenant.contracts.map(c => (
                  <div key={c.id} className="card" style={{ padding: 14, marginBottom: 8, cursor: 'pointer' }} onClick={() => { setSelectedTenant(null); navigate(`/contracts/${c.id}`); }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{c.propertyName}</strong> — {c.unitNumber}
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {c.startDate} {c.endDate ? `→ ${c.endDate}` : ''} | {Number(c.monthlyRent).toLocaleString('ar-SA')} ريال/شهرياً
                        </div>
                      </div>
                      <span className={`badge ${c.status === 'Active' ? 'badge-green' : 'badge-gray'}`}>
                        {c.status === 'Active' ? 'نشط' : c.status === 'Terminated' ? 'منتهي' : 'منتهي'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {selectedTenant.recentPayments?.length > 0 && (
              <>
                <h4 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 10, marginTop: 16 }}>آخر المدفوعات</h4>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr><th>الفاتورة</th><th>المبلغ</th><th>التاريخ</th><th>طريقة الدفع</th></tr>
                    </thead>
                    <tbody>
                      {selectedTenant.recentPayments.map(p => (
                        <tr key={p.id}>
                          <td className="cell-muted">{p.invoiceNumber}</td>
                          <td className="cell-number">{Number(p.amount).toLocaleString('ar-SA')}</td>
                          <td className="cell-muted">{p.paymentDate}</td>
                          <td className="cell-muted">{p.paymentMethod === 'Cash' ? 'نقداً' : p.paymentMethod === 'BankTransfer' ? 'تحويل بنكي' : 'شيك'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
