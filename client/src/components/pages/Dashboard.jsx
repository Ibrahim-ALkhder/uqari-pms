import { useState, useEffect, useRef } from 'react';
import api from '../../api/axiosConfig';
import './Dashboard.css';

const STATUS_LABELS = {
  Paid: 'مدفوعة',
  Partial: 'مدفوعة جزئياً',
  Overdue: 'متأخرة',
  Unpaid: 'غير مدفوعة',
  Cancelled: 'ملغاة',
};

const STATUS_CLASSES = {
  Paid: 'status-paid',
  Partial: 'status-partial',
  Overdue: 'status-overdue',
  Unpaid: 'status-unpaid',
  Cancelled: 'status-cancelled',
};

function formatCurrency(n) {
  return Number(n).toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MetricSkeleton() {
  return (
    <div className="metric-card skeleton">
      <div className="sk-line sk-short" />
      <div className="sk-line sk-long" />
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [undoMsg, setUndoMsg] = useState(null);
  const undoRef = useRef(null);

  useEffect(() => {
    return () => {
      if (undoRef.current) clearTimeout(undoRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [sumRes, invRes, payRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/invoices?limit=15'),
          api.get('/payments?limit=30'),
        ]);

        if (cancelled) return;

        const s = sumRes.data.data;
        const invoices = invRes.data.data;
        const payments = payRes.data.data;

        const recentByInvoice = {};
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        for (const p of payments) {
          if (!recentByInvoice[p.invoiceId]) {
            const age = now - new Date(p.createdAt).getTime();
            recentByInvoice[p.invoiceId] = {
              recent: age < DAY_MS,
              paymentId: p.id,
              paymentDate: p.paymentDate,
            };
          }
        }

        const merged = invoices.map((inv) => {
          const info = recentByInvoice[inv.id];
          const isRecent = info?.recent && inv.status === 'Paid';
          return { ...inv, canUndo: isRecent, paymentId: isRecent ? info.paymentId : null };
        });

        setSummary(s);
        setMovements(merged);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'فشل تحميل البيانات');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  function handleUndo(invoice) {
    if (!window.confirm(`هل أنت متأكد من حذف الدفعة الأخيرة للفاتورة ${invoice.invoiceNumber}؟`)) return;
    setUndoMsg(`تم إرسال طلب إلغاء الدفعة للفاتورة ${invoice.invoiceNumber}`);
    if (undoRef.current) clearTimeout(undoRef.current);
    undoRef.current = setTimeout(() => setUndoMsg(null), 3000);
  }

  if (loading) {
    return (
      <div className="dashboard">
        <h2 className="dash-title">لوحة التحكم</h2>
        <div className="metrics-grid">
          <MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton />
        </div>
        <div className="movements-section">
          <div className="section-header skeleton" style={{ width: 280, height: 28, marginBottom: 20 }} />
          <div className="table-skeleton">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sk-row"><div className="sk-line sk-long" /></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-card">
          <span className="error-icon">!</span>
          <p>{error}</p>
          <button className="btn-retry" onClick={() => window.location.reload()}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: 'إجمالي الدخل الشهري',
      value: `${formatCurrency(summary.totalMonthlyIncome)} ريال`,
      icon: '📊',
      accent: 'accent-blue',
    },
    {
      label: 'نسبة الإشغال',
      value: `%${summary.occupancyRate}`,
      sub: `${summary.occupiedUnits} / ${summary.totalUnits} وحدة`,
      icon: '🏢',
      accent: 'accent-green',
    },
    {
      label: 'المستأجرون النشطون',
      value: summary.activeTenants,
      icon: '👤',
      accent: 'accent-purple',
    },
    {
      label: 'المتأخر على المستأجرين',
      value: `${formatCurrency(summary.overdueAmount)} ريال`,
      sub: `${summary.unpaidCount} فاتورة غير مدفوعة`,
      icon: '⚠️',
      accent: 'accent-red',
    },
  ];

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h2 className="dash-title">لوحة التحكم</h2>
        <div className="dash-meta">
          <span className="dash-tickets">{summary.pendingTickets} تذاكر معلقة</span>
        </div>
      </div>

      <div className="metrics-grid">
        {metrics.map((m, i) => (
          <div key={i} className={`metric-card ${m.accent}`}>
            <div className="metric-icon">{m.icon}</div>
            <div className="metric-body">
              <span className="metric-label">{m.label}</span>
              <span className="metric-value">{m.value}</span>
              {m.sub && <span className="metric-sub">{m.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="movements-section">
        <div className="section-header">
          <h3>آخر الحركات المالية</h3>
          <span className="section-count">{movements.length} حركة</span>
        </div>

        {undoMsg && <div className="undo-toast">{undoMsg}</div>}

        <div className="movements-table-wrapper">
          <table className="movements-table">
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>المستأجر</th>
                <th>الوحدة</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>تاريخ الاستحقاق</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {movements.map((inv) => (
                <tr key={inv.id}>
                  <td className="cell-invoice">{inv.invoiceNumber}</td>
                  <td className="cell-tenant">{inv.tenantName}</td>
                  <td className="cell-unit">{inv.unitNumber}</td>
                  <td className="cell-amount">{formatCurrency(inv.amount)}</td>
                  <td>
                    <span className={`status-badge ${STATUS_CLASSES[inv.status] || ''}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="cell-date">{inv.dueDate}</td>
                  <td className="cell-action">
                    {inv.canUndo ? (
                      <button className="btn-undo" onClick={() => handleUndo(inv)} title="إلغاء الدفعة">
                        ↩
                      </button>
                    ) : (
                      <span className="undo-placeholder" />
                    )}
                  </td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="cell-empty">لا توجد حركات مالية حتى الآن</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
