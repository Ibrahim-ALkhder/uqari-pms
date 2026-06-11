import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

const EXPENSE_TYPES = {
  Maintenance: 'صيانة', Utilities: 'خدمات', Repairs: 'إصلاحات', Cleaning: 'تنظيف',
  MunicipalityFees: 'رسوم بلدية', Insurance: 'تأمين', Other: 'أخرى',
};

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [properties, setProperties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [propFilter, setPropFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ propertyId: '', type: 'Maintenance', amount: '', date: new Date().toISOString().slice(0, 10), description: '', receipt: null });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
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

  async function fetchData() {
    try {
      setLoading(true);
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (propFilter) params.property_id = propFilter;

      const [expRes, propsRes] = await Promise.all([
        api.get('/expenses', { params }),
        api.get('/properties'),
      ]);
      setExpenses(expRes.data.data);
      setProperties(propsRes.data.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [typeFilter, propFilter]);

  async function fetchSummary() {
    try {
      const res = await api.get('/expenses/summary');
      setSummary(res.data.data);
      setShowSummary(true);
    } catch {
      showToast('فشل تحميل الملخص', 'error');
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ propertyId: properties[0]?.id ? String(properties[0].id) : '', type: 'Maintenance', amount: '', date: new Date().toISOString().slice(0, 10), description: '', receipt: null });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(e) {
    setEditing(e);
    setForm({ propertyId: String(e.propertyId || ''), type: e.type, amount: String(e.amount), date: e.date, description: e.description, receipt: null });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.amount || form.amount <= 0) { setFormError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (!form.description.trim() || form.description.trim().length < 3) { setFormError('الوصف مطلوب (3 أحرف على الأقل)'); return; }
    setSaving(true);
    try {
      const body = new FormData();
      if (form.propertyId) body.append('propertyId', form.propertyId);
      body.append('type', form.type);
      body.append('amount', form.amount);
      body.append('date', form.date);
      body.append('description', form.description);
      if (form.receipt) body.append('receipt', form.receipt);

      const config = { headers: { 'Content-Type': 'multipart/form-data' } };

      if (editing) {
        await api.put(`/expenses/${editing.id}`, {
          type: form.type, amount: Number(form.amount), date: form.date,
          description: form.description, propertyId: form.propertyId ? Number(form.propertyId) : undefined,
        });
        showToast('✓ تم تحديث المصروف');
      } else {
        await api.post('/expenses', body, config);
        showToast(`✓ تم إضافة مصروف ${EXPENSE_TYPES[form.type]} بقيمة ${Number(form.amount).toLocaleString('ar-SA')} ريال`);
      }
      setShowModal(false);
      await fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ المصروف');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ex) {
    if (!window.confirm(`حذف مصروف "${ex.description}" بقيمة ${Number(ex.amount).toLocaleString('ar-SA')} ريال؟`)) return;
    try {
      await api.delete(`/expenses/${ex.id}`);
      showToast('✓ تم حذف المصروف');
      await fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل الحذف', 'error');
    }
  }

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>المصروفات</h2>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchSummary}>الملخص</button>
          <button className="btn btn-primary" onClick={openAdd}>+ إضافة مصروف</button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">جميع الأنواع</option>
          {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-select" value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">جميع العقارات</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          <button className="btn btn-primary" onClick={fetchData}>إعادة المحاولة</button>
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <p className="empty-state-text">لا توجد مصروفات مسجلة</p>
          <button className="btn btn-primary" onClick={openAdd}>إضافة أول مصروف</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الوصف</th>
                <th>العقار</th>
                <th>المبلغ</th>
                <th>الإيصال</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(ex => (
                <tr key={ex.id}>
                  <td className="cell-muted">{ex.date}</td>
                  <td><span className="badge badge-orange">{EXPENSE_TYPES[ex.type] || ex.type}</span></td>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.description}</td>
                  <td className="cell-muted">{ex.propertyName || '—'}</td>
                  <td className="cell-number">{Number(ex.amount).toLocaleString('ar-SA')}</td>
                  <td>{ex.receiptImagePath ? <a href={`/uploads/receipts/${ex.receiptImagePath.split('/').pop()}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>📎 عرض</a> : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn-icon" onClick={() => openEdit(ex)} title="تعديل">✎</button>
                      <button className="btn-icon danger" onClick={() => handleDelete(ex)} title="حذف">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل المصروف' : 'إضافة مصروف جديد'}>
        <form onSubmit={handleSave} className="form-layout">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">النوع</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required>
                {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">العقار (اختياري)</label>
              <select className="form-select" value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })}>
                <option value="">بدون عقار</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">المبلغ (ريال)</label>
              <input className="form-input" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">الوصف</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="تفاصيل المصروف" required />
          </div>
          {!editing && (
            <div className="form-group">
              <label className="form-label">إرفاق إيصال (اختياري)</label>
              <input className="form-input" type="file" accept="image/*,.pdf" onChange={e => setForm({ ...form, receipt: e.target.files[0] })} style={{ padding: 8 }} />
            </div>
          )}
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : editing ? 'حفظ التغييرات' : 'إضافة المصروف'}</button>
          </div>
        </form>
      </Modal>

      {/* Summary Modal */}
      {showSummary && summary && (
        <Modal open={true} onClose={() => setShowSummary(false)} title="ملخص المصروفات">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">إجمالي المصروفات</span>
              <span className="stat-value">{Number(summary.summary.total).toLocaleString('ar-SA')} ريال</span>
              <span className="stat-sub">{summary.summary.count} عملية</span>
            </div>
          </div>

          {summary.byProperty?.length > 0 && (
            <>
              <h4 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 10, marginTop: 8 }}>حسب العقار</h4>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>العقار</th><th>عدد العمليات</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {summary.byProperty.map(p => (
                      <tr key={p.propertyId}>
                        <td>{p.propertyName}</td>
                        <td className="cell-muted">{p.count}</td>
                        <td className="cell-number">{Number(p.total).toLocaleString('ar-SA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {summary.byType?.length > 0 && (
            <>
              <h4 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 10, marginTop: 16 }}>حسب النوع</h4>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>النوع</th><th>عدد العمليات</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {summary.byType.map(t => (
                      <tr key={t.type}>
                        <td>{t.typeLabel}</td>
                        <td className="cell-muted">{t.count}</td>
                        <td className="cell-number">{Number(t.total).toLocaleString('ar-SA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
