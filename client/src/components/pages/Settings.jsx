import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import './pages.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ currency: 'SAR', billingDay: '1', dueDay: '5', fontSize: 'extraLarge', companyName: '', phone: '', bankAccount: '' });
  const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '', confirmPin: '' });
  const [pinSection, setPinSection] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [user, setUser] = useState(null);
  const successRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successRef.current) clearTimeout(successRef.current);
    };
  }, []);

  const showSuccess = useCallback((msg) => {
    setSuccess(msg);
    if (successRef.current) clearTimeout(successRef.current);
    successRef.current = setTimeout(() => setSuccess(null), 3000);
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const [setRes] = await Promise.all([api.get('/settings')]);
        const s = setRes.data.data;
        setSettings(s);
        setForm({
          currency: s.currency || 'SAR',
          billingDay: s.billingDay || '1',
          dueDay: s.dueDay || '5',
          fontSize: s.fontSize || 'extraLarge',
          companyName: s.companyName || '',
          phone: s.phone || '',
          bankAccount: s.bankAccount || '',
        });
      } catch (err) {
        setError('فشل تحميل الإعدادات');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();

    // Decode user info from token
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch { /* ignore */ }
    }
  }, []);

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.put('/settings', {
        currency: form.currency,
        billingDay: form.billingDay,
        dueDay: form.dueDay,
        fontSize: form.fontSize,
        companyName: form.companyName || undefined,
        phone: form.phone || undefined,
        bankAccount: form.bankAccount || undefined,
      });
      setSettings(res.data.data);
      showSuccess('✓ تم حفظ الإعدادات بنجاح');
    } catch (err) {
      setError(err.response?.data?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePin(e) {
    e.preventDefault();
    setError(null);
    if (pinForm.newPin && pinForm.newPin !== pinForm.confirmPin) { setError('رمز PIN الجديد وتأكيده غير متطابقين'); return; }
    if (pinForm.newPin && (pinForm.newPin.length !== 4 || !/^\d{4}$/.test(pinForm.newPin))) { setError('رمز PIN يجب أن يكون 4 أرقام'); return; }
    setSaving(true);
    try {
      await api.post('/auth/change-pin', {
        currentPin: pinForm.currentPin,
        newPin: pinForm.newPin || null,
        confirmPin: pinForm.confirmPin || null,
      });
      showSuccess(pinForm.newPin ? '✓ تم تحديث رمز PIN' : '✓ تم إلغاء تفعيل رمز PIN');
      setPinForm({ currentPin: '', newPin: '', confirmPin: '' });
      setPinSection(false);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل تغيير PIN');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page"><div className="loading-state"><div className="loading-spinner" /><p>جاري التحميل…</p></div></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 700 }}>
      {success && <div className="toast toast-success">{success}</div>}

      <div className="page-header">
        <h2>الإعدادات</h2>
      </div>

      {/* Account Info */}
      {user && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 16 }}>الحساب</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">البريد الإلكتروني</span>
              <span className="detail-value" dir="ltr" style={{ textAlign: 'right' }}>{user.email}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">الدور</span>
              <span className="detail-value">{user.role === 'landlord' ? 'مالك' : user.role}</span>
            </div>
          </div>
        </div>
      )}

      {/* Billing Settings */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="card-title" style={{ marginBottom: 16 }}>إعدادات الفوترة</h3>
        <form onSubmit={handleSaveSettings} className="form-layout">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">العملة</label>
              <select className="form-select" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="AED">درهم إماراتي (AED)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">حجم الخط</label>
              <select className="form-select" value={form.fontSize} onChange={e => setForm({ ...form, fontSize: e.target.value })}>
                <option value="small">صغير</option>
                <option value="medium">وسط</option>
                <option value="large">كبير</option>
                <option value="extraLarge">كبير جداً</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">يوم الفوترة</label>
              <input className="form-input" type="number" min="1" max="28" value={form.billingDay} onChange={e => setForm({ ...form, billingDay: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">يوم الاستحقاق</label>
              <input className="form-input" type="number" min="1" max="28" value={form.dueDay} onChange={e => setForm({ ...form, dueDay: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">اسم الشركة (اختياري)</label>
            <input className="form-input" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="اسم الشركة أو المؤسسة" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">رقم الجوال (اختياري)</label>
              <input className="form-input" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" />
            </div>
            <div className="form-group">
              <label className="form-label">الحساب البنكي (اختياري)</label>
              <input className="form-input" dir="ltr" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="رقم الحساب أو IBAN" />
            </div>
          </div>

          {error && <div className="form-error" style={{ textAlign: 'center' }}>{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ…' : 'حفظ الإعدادات'}
            </button>
          </div>
        </form>
      </div>

      {/* PIN Management */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">رمز PIN</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => setPinSection(!pinSection)}>
            {pinSection ? 'إلغاء' : (settings.pinEnabled === 'true' ? 'تغيير' : 'تفعيل')}
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          {settings.pinEnabled === 'true' ? '✓ رمز PIN مفعل حالياً' : '✗ رمز PIN غير مفعل'}
        </p>

        {pinSection && (
          <form onSubmit={handleChangePin} className="form-layout" style={{ marginTop: 16 }}>
            {settings.pinEnabled === 'true' && (
              <div className="form-group">
                <label className="form-label">رمز PIN الحالي</label>
                <input className="form-input" type="password" dir="ltr" maxLength={4} value={pinForm.currentPin}
                  onChange={e => setPinForm({ ...pinForm, currentPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="4 أرقام" required />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">رمز PIN الجديد</label>
                <input className="form-input" type="password" dir="ltr" maxLength={4} value={pinForm.newPin}
                  onChange={e => setPinForm({ ...pinForm, newPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="4 أرقام" required />
              </div>
              <div className="form-group">
                <label className="form-label">تأكيد PIN الجديد</label>
                <input className="form-input" type="password" dir="ltr" maxLength={4} value={pinForm.confirmPin}
                  onChange={e => setPinForm({ ...pinForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="تأكيد" required />
              </div>
            </div>
            {settings.pinEnabled === 'true' && (
              <p style={{ color: '#64748b', fontSize: 12 }}>اترك حقلي PIN الجديد فارغين لإلغاء تفعيل رمز PIN</p>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري…' : 'حفظ'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
