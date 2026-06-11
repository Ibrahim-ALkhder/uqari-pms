import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../shared/Modal';
import './pages.css';

const STATUS_LABELS = { Paid: 'مدفوعة', Partial: 'مدفوعة جزئياً', Overdue: 'متأخرة', Unpaid: 'غير مدفوعة', Cancelled: 'ملغاة' };
const STATUS_CLASSES = { Paid: 'badge-green', Partial: 'badge-yellow', Overdue: 'badge-red', Unpaid: 'badge-gray', Cancelled: 'badge-gray' };

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [payInvoice, setPayInvoice] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('all');
  const [overdueInvoices, setOverdueInvoices] = useState([]);
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

  async function fetchInvoices() {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (monthFilter) params.billingMonth = monthFilter;
      if (yearFilter) params.billingYear = yearFilter;

      if (viewMode === 'overdue') {
        const res = await api.get('/invoices/overdue');
        setOverdueInvoices(res.data.data);
        setInvoices([]);
      } else {
        const res = await api.get('/invoices', { params });
        setInvoices(res.data.data);
        setOverdueInvoices([]);
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInvoices(); }, [statusFilter, monthFilter, yearFilter, viewMode]);

  function openPay(inv) {
    setPayInvoice(inv);
    setPayForm({ amount: String(inv.amount - (inv.paidAmount || 0)), paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
    setFormError(null);
  }

  async function handlePay(e) {
    e.preventDefault();
    setFormError(null);
    if (!payForm.amount || payForm.amount <= 0) { setFormError('المبلغ يجب أن يكون أكبر من صفر'); return; }
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
      await fetchInvoices();
    } catch (err) {
      setFormError(err.response?.data?.message || 'فشل تسجيل الدفعة');
    } finally {
      setSaving(false);
    }
  }

  const displayInvoices = viewMode === 'overdue' ? overdueInvoices : invoices;

  return (
    <div className="page">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>الفواتير</h2>
        <div className="page-header-actions">
          <button className={`btn ${viewMode === 'overdue' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setViewMode(viewMode === 'overdue' ? 'all' : 'overdue')}>
            {viewMode === 'overdue' ? 'كل الفواتير' : 'الفواتير المتأخرة'}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">جميع الحالات</option>
          <option value="Unpaid">غير مدفوعة</option>
          <option value="Paid">مدفوعة</option>
          <option value="Partial">مدفوعة جزئياً</option>
          <option value="Overdue">متأخرة</option>
        </select>
        <select className="form-select" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
          <option value="">كل الشهور</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
            <option key={m} value={m}>{m.toLocaleString('ar-SA')}</option>
          ))}
        </select>
        <select className="form-select" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="">كل السنوات</option>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="table-wrapper">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton-row"><div className="skeleton-cell" /><div className="skeleton-cell" /><div className="skeleton-cell" /><div className="skeleton-cell" /></div>)}
        </div>
      ) : error ? (
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-primary" onClick={fetchInvoices}>إعادة المحاولة</button>
        </div>
      ) : displayInvoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <p className="empty-state-text">
            {viewMode === 'overdue' ? 'لا توجد فواتير متأخرة' : 'لا توجد فواتير'}
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>المستأجر</th>
                <th>الوحدة</th>
                <th>الشهر</th>
                <th>المبلغ</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>تاريخ الاستحقاق</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayInvoices.map(inv => {
                const remaining = inv.amount - (inv.paidAmount || 0);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, fontSize: 13, color: '#94a3b8' }}>{inv.invoiceNumber}</td>
                    <td>{inv.tenantName}</td>
                    <td className="cell-muted">{inv.unitNumber}</td>
                    <td className="cell-muted">{inv.billingMonth}/{inv.billingYear}</td>
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
        <Modal open={true} onClose={() => setPayInvoice(null)} title={`تسديد ${payInvoice.invoiceNumber}`}>
          <form onSubmit={handlePay} className="form-layout">
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
              <span style={{ color: '#94a3b8' }}>المستأجر:</span>
              <span style={{ fontWeight: 600 }}>{payInvoice.tenantName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
              <span style={{ color: '#94a3b8' }}>المبلغ:</span>
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
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPayInvoice(null)}>إلغاء</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جاري…' : 'تسديد'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
