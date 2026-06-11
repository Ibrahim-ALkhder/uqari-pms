import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import './pages.css';

const UNIT_TYPE_LABELS = { Apartment: 'شقة', Shop: 'محل', Room: 'غرفة', Villa: 'فيلا', Studio: 'استوديو' };

export default function UnitForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState({ propertyId: '', unitNumber: '', type: 'Apartment', floor: '', monthlyRent: '', status: 'Vacant' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
      if (navRef.current) clearTimeout(navRef.current);
    };
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [propsRes] = await Promise.all([api.get('/properties')]);
        setProperties(propsRes.data.data);

        if (isEdit) {
          const unitRes = await api.get(`/units/${id}`);
          const u = unitRes.data.data;
          setForm({
            propertyId: String(u.propertyId),
            unitNumber: u.unitNumber,
            type: u.type,
            floor: u.floor || '',
            monthlyRent: String(u.monthlyRent || ''),
            status: u.status,
          });
        } else if (propsRes.data.data.length > 0) {
          setForm(f => ({ ...f, propertyId: String(propsRes.data.data[0].id) }));
        }
      } catch (err) {
        setError(err.response?.data?.message || 'فشل التحميل');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.propertyId) { setFormError('اختر العقار'); return; }
    if (!form.unitNumber.trim()) { setFormError('رقم الوحدة مطلوب'); return; }
    if (!form.monthlyRent || form.monthlyRent < 0) { setFormError('الإيجار الشهري مطلوب'); return; }
    setSaving(true);
    try {
      const body = {
        propertyId: Number(form.propertyId),
        unitNumber: form.unitNumber,
        type: form.type,
        floor: form.floor || null,
        monthlyRent: Number(form.monthlyRent),
        status: form.status,
      };
      if (isEdit) {
        await api.put(`/units/${id}`, body);
        showToast('✓ تم تحديث الوحدة بنجاح');
      } else {
        await api.post('/units', body);
        showToast('✓ تم إضافة الوحدة بنجاح');
      }
      if (navRef.current) clearTimeout(navRef.current);
      navRef.current = setTimeout(() => navigate('/properties'), 800);
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل حفظ الوحدة');
    } finally {
      setSaving(false);
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
          <button className="btn btn-secondary" onClick={() => navigate('/properties')}>العودة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div className="page-header">
        <h2>{isEdit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}</h2>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <form onSubmit={handleSubmit} className="form-layout">
          <div className="form-group">
            <label className="form-label">العقار</label>
            <select className="form-select" value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} required>
              <option value="">اختر العقار…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} - {p.city}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">رقم الوحدة</label>
            <input className="form-input" value={form.unitNumber} onChange={e => setForm({ ...form, unitNumber: e.target.value })} placeholder="مثال: وحدة 5" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">النوع</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">الدور</label>
              <input className="form-input" type="number" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} placeholder="اختياري" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">الإيجار الشهري (ريال)</label>
              <input className="form-input" type="number" min="0" value={form.monthlyRent} onChange={e => setForm({ ...form, monthlyRent: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">الحالة</label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Vacant">شاغرة</option>
                <option value="Occupied">مؤجرة</option>
                <option value="UnderMaintenance">تحت الصيانة</option>
              </select>
            </div>
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ…' : isEdit ? 'حفظ التغييرات' : 'إضافة الوحدة'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
