import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

const STATUS_LABELS = { Paid: 'مدفوعة', Partial: 'مدفوعة جزئياً', Overdue: 'متأخرة', Unpaid: 'غير مدفوعة', Cancelled: 'ملغاة' };
const STATUS_CLASSES = { Paid: 'badge-green', Partial: 'badge-yellow', Overdue: 'badge-red', Unpaid: 'badge-gray', Cancelled: 'badge-gray' };

export default function ContractDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create contract state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [createForm, setCreateForm] = useState({ tenantId: '', unitId: '', startDate: '', monthlyRent: '', endDate: '' });

  // Payment state
  const [payInvoice, setPayInvoice] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });

  // Terminate state
  const [showTerminate, setShowTerminate] = useState(false);
  const [termForm, setTermForm] = useState({ terminationDate: new Date().toISOString().slice(0, 10), reason: '' });

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

  async function fetchContract() {
    try {
      setLoading(true);
      const res = await api.get(`/contracts/${id}`);
      setContract(res.data.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) { setError('العقد غير موجود'); return; }
      setError(err.response?.data?.message || 'فشل تحميل العقد');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) fetchContract(); else { setLoading(false); openCreate(); } }, [id]);

  async function openCreate() {
    setShowCreateModal(true);
    setFormError(null);
    try {
      const [tRes, uRes] = await Promise.all([api.get('/tenants?status=active'), api.get('/units?status=Vacant')]);
      setTenants(tRes.data.data);
      setUnits(uRes.data.data);
      if (tRes.data.data.length > 0) setCreateForm(f => ({ ...f, tenantId: String(tRes.data.data[0].id) }));
      if (uRes.data.data.length > 0) setCreateForm(f => ({ ...f, unitId: String(uRes.data.data[0].id) }));
    } catch (err) {
      setFormError('فشل تحميل بيانات المستأجرين أو الوحدات');
    }
  }

  async function handleCreateContract(e) {
    e.preventDefault();
    setFormError(null);
    if (!createForm.tenantId || !createForm.unitId || !createForm.startDate || !createForm.monthlyRent) {
      setFormError('يرجى ملء جميع الحقول المطلوبة'); return;
    }
    setSaving(true);
    try {
      const res = await api.post('/contracts', {
        tenantId: Number(createForm.tenantId),
        unitId: Number(createForm.unitId),
        startDate: createForm.startDate,
        monthlyRent: Number(createForm.monthlyRent),
        endDate: createForm.endDate || undefined,
      });
      showToast('✓ تم إنشاء العقد وتوليد الفاتورة الأولى');
      setShowCreateModal(false);
      navigate(`/contracts/${res.data.data.contract.id}`);
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل إنشاء العقد');
    } finally {
      setSaving(false);
    }
  }

  function openPay(inv) {
    setPayInvoice(inv);
    setPayForm({ amount: String(inv.amount - (inv.paidAmount || 0)), paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
    setFormError(null);
  }

  async function handlePay(e) {
    e.preventDefault();
    setFormError(null);
    if (!payForm.amount || payForm.amount <= 0) { setFormError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (!payForm.paymentDate) { setFormError('تاريخ الدفع مطلوب'); return; }
    setSaving(true);
    try {
      await api.post('/payments', {
        invoiceId: payInvoice.id,
        amount: Number(payForm.amount),
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        notes: payForm.notes || undefined,
      });
      showToast('✓ تم تسجيل الدفعة بنجاح');
      setPayInvoice(null);
      await fetchContract();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل تسجيل الدفعة');
    } finally {
      setSaving(false);
    }
  }

  async function handleTerminate(e) {
    e.preventDefault();
    setFormError(null);
    if (!termForm.terminationDate) { setFormError('تاريخ الإنهاء مطلوب'); return; }
    setSaving(true);
    try {
      const res = await api.patch(`/contracts/${id}/terminate`, {
        terminationDate: termForm.terminationDate,
        reason: termForm.reason || undefined,
      });
      if (res.data.data.warning) showToast(res.data.data.warning, 'info');
      else showToast('✓ تم إنهاء العقد وتحرير الوحدة');
      setShowTerminate(false);
      await fetchContract();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل إنهاء العقد');
    } finally {
      setSaving(false);
    }
  }

  // No contract ID => create mode
  if (!id) {
    return (
      <div className="page">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <div className="page-header">
          <h2>إنشاء عقد جديد</h2>
        </div>
        <div className="card" style={{ maxWidth: 600 }}>
          <form onSubmit={handleCreateContract} className="form-layout">
            <div className="form-group">
              <label className="form-label">المستأجر</label>
              <select className="form-select" value={createForm.tenantId} onChange={e => setCreateForm({ ...createForm, tenantId: e.target.value })} required>
                <option value="">اختر المستأجر…</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.fullName} - {t.phone}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">الوحدة</label>
              <select className="form-select" value={createForm.unitId} onChange={e => setCreateForm({ ...createForm, unitId: e.target.value })} required>
                <option value="">اختر الوحدة…</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber} - {u.propertyName} ({Number(u.monthlyRent).toLocaleString('ar-SA')} ريال)</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">تاريخ البداية</label>
                <input className="form-input" type="date" value={createForm.startDate} onChange={e => setCreateForm({ ...createForm, startDate: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">الإيجار الشهري (ريال)</label>
                <input className="form-input" type="number" min="1" value={createForm.monthlyRent} onChange={e => setCreateForm({ ...createForm, monthlyRent: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">تاريخ النهاية (اختياري)</label>
              <input className="form-input" type="date" value={createForm.endDate} onChange={e => setCreateForm({ ...createForm, endDate: e.target.value })} />
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>إلغاء</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري الإنشاء…' : 'إنشاء العقد'}</button>
            </div>
          </form>
        </div>
      </div>
    );
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
          <button className="btn btn-secondary" onClick={() => navigate('/')}>العودة إلى الرئيسية</button>
        </div>
      </div>
    );
  }

  const invoices = contract?.invoices || [];

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h2>العقد #{contract.id}</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {contract.tenantName} — {contract.propertyName} ({contract.unitNumber})
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← رجوع</button>
          {contract.status === 'Active' && (
            <button className="btn btn-danger" onClick={() => { setTermForm(f => ({ ...f, terminationDate: new Date().toISOString().slice(0, 10) })); setShowTerminate(true); }}>
              إنهاء العقد
            </button>
          )}
        </div>
      </div>

      {/* Contract Details */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">المستأجر</span>
            <span className="detail-value">{contract.tenantName}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">جوال المستأجر</span>
            <span className="detail-value" dir="ltr" style={{ textAlign: 'right' }}>{contract.tenantPhone}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">العقار / الوحدة</span>
            <span className="detail-value">{contract.propertyName} — {contract.unitNumber}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">الإيجار الشهري</span>
            <span className="detail-value">{Number(contract.monthlyRent).toLocaleString('ar-SA')} ريال</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">تاريخ البداية</span>
            <span className="detail-value">{contract.startDate}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">تاريخ النهاية</span>
            <span className="detail-value">{contract.endDate || 'مستمر'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">الحالة</span>
            <span className={`badge ${contract.status === 'Active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 14, padding: '4px 16px' }}>
              {contract.status === 'Active' ? 'نشط' : contract.status === 'Terminated' ? 'منتهي' : 'منتهي'}
            </span>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <h3 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>
        الفواتير ({invoices.length})
      </h3>

      {invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <p className="empty-state-text">لا توجد فواتير لهذا العقد</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>الشهر</th>
                <th>السنة</th>
                <th>المبلغ</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>تاريخ الاستحقاق</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const remaining = inv.amount - (inv.paidAmount || 0);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, fontSize: 13, color: '#94a3b8' }}>{inv.invoiceNumber}</td>
                    <td className="cell-muted">{inv.billingMonth}</td>
                    <td className="cell-muted">{inv.billingYear}</td>
                    <td className="cell-number">{Number(inv.amount).toLocaleString('ar-SA')}</td>
                    <td className="cell-number" style={{ color: '#34d399' }}>{Number(inv.paidAmount || 0).toLocaleString('ar-SA')}</td>
                    <td className="cell-number" style={{ color: remaining > 0 ? '#f87171' : '#34d399' }}>{remaining.toLocaleString('ar-SA')}</td>
                    <td className="cell-muted">{inv.dueDate}</td>
                    <td><span className={`badge ${STATUS_CLASSES[inv.status]}`}>{STATUS_LABELS[inv.status]}</span></td>
                    <td>
                      {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                        <button className="btn btn-sm btn-success" onClick={() => openPay(inv)}>دفع</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Modal */}
      {payInvoice && (
        <Modal open={true} onClose={() => setPayInvoice(null)} title={`تسديد فاتورة ${payInvoice.invoiceNumber}`}>
          <form onSubmit={handlePay} className="form-layout">
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
              <span style={{ color: '#94a3b8' }}>المطلوب:</span>
              <span style={{ fontWeight: 600 }}>{Number(payInvoice.amount).toLocaleString('ar-SA')} ريال</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
              <span style={{ color: '#94a3b8' }}>المدفوع سابقاً:</span>
              <span style={{ fontWeight: 600, color: '#34d399' }}>{Number(payInvoice.paidAmount || 0).toLocaleString('ar-SA')} ريال</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginBottom: 16 }}>
              <span style={{ color: '#94a3b8' }}>المتبقي:</span>
              <span style={{ fontWeight: 700, color: '#f87171', fontSize: 18 }}>{Number(payInvoice.amount - (payInvoice.paidAmount || 0)).toLocaleString('ar-SA')} ريال</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">المبلغ</label>
                <input className="form-input" type="number" min="1" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">طريقة الدفع</label>
                <select className="form-select" value={payForm.paymentMethod} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
                  <option value="Cash">نقداً</option>
                  <option value="BankTransfer">تحويل بنكي</option>
                  <option value="Cheque">شيك</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">تاريخ الدفع</label>
              <input className="form-input" type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">ملاحظات (اختياري)</label>
              <input className="form-input" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="اختياري" />
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPayInvoice(null)}>إلغاء</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري التسجيل…' : 'تسديد'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Terminate Modal */}
      {showTerminate && (
        <Modal open={true} onClose={() => setShowTerminate(false)} title="إنهاء العقد">
          <form onSubmit={handleTerminate} className="form-layout">
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>
              سيتم إنهاء العقد وتحرير الوحدة. لن يتم حذف الفواتير غير المدفوعة.
            </p>
            <div className="form-group">
              <label className="form-label">تاريخ الإنهاء</label>
              <input className="form-input" type="date" value={termForm.terminationDate} onChange={e => setTermForm({ ...termForm, terminationDate: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">سبب الإنهاء (اختياري)</label>
              <input className="form-input" value={termForm.reason} onChange={e => setTermForm({ ...termForm, reason: e.target.value })} placeholder="مثال: إخلاء" />
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowTerminate(false)}>إلغاء</button>
              <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? 'جاري…' : 'إنهاء العقد'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
