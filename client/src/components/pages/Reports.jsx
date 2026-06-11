import { useState, useEffect } from 'react';
import api from '../../api/axiosConfig';
import './pages.css';

function formatCurrency(n) {
  return Number(n).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Bar({ value, max, color, label }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 100, fontSize: 12, color: '#94a3b8', textAlign: 'left', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.5s ease', minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <span style={{ width: 80, fontSize: 12, color: '#e2e8f0', fontFamily: "'Inter','Cairo',sans-serif", direction: 'ltr', textAlign: 'right', flexShrink: 0 }}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState('income');
  const [summary, setSummary] = useState(null);
  const [incomeExpenses, setIncomeExpenses] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        const [sumRes, ieRes, ovRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/dashboard/income-expenses?months=12'),
          api.get('/invoices/overdue'),
        ]);
        setSummary(sumRes.data.data);
        setIncomeExpenses(ieRes.data.data);
        setOverdue(ovRes.data.data);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.message || 'فشل تحميل التقارير');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return <div className="page"><div className="loading-state"><div className="loading-spinner" /><p>جاري تحميل التقارير…</p></div></div>;
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <p className="error-state-text">{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  const maxIncome = incomeExpenses?.income?.length > 0 ? Math.max(...incomeExpenses.income.map(i => i.totalIncome)) : 1;
  const maxExpense = incomeExpenses?.expenses?.length > 0 ? Math.max(...incomeExpenses.expenses.map(e => e.totalExpenses)) : 1;
  const allMonths = [...new Set([
    ...(incomeExpenses?.income || []).map(i => `${i.year}-${String(i.month).padStart(2, '0')}`),
    ...(incomeExpenses?.expenses || []).map(e => `${e.year}-${String(e.month).padStart(2, '0')}`),
  ])].sort();

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-header">
        <h2>التقارير</h2>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card">
            <span className="stat-label">الدخل الشهري</span>
            <span className="stat-value" style={{ color: '#34d399' }}>{formatCurrency(summary.totalMonthlyIncome)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">نسبة الإشغال</span>
            <span className="stat-value" style={{ color: '#60a5fa' }}>{summary.occupancyRate}%</span>
            <span className="stat-sub">{summary.occupiedUnits}/{summary.totalUnits} وحدة</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">المستأجرون النشطون</span>
            <span className="stat-value" style={{ color: '#a78bfa' }}>{summary.activeTenants}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">المتأخرات</span>
            <span className="stat-value" style={{ color: '#f87171' }}>{formatCurrency(summary.overdueAmount)}</span>
            <span className="stat-sub">{summary.unpaidCount} فاتورة</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="section-tabs">
        <button className={`section-tab ${activeTab === 'income' ? 'active' : ''}`} onClick={() => setActiveTab('income')}>الدخل والمصروفات</button>
        <button className={`section-tab ${activeTab === 'occupancy' ? 'active' : ''}`} onClick={() => setActiveTab('occupancy')}>الإشغال</button>
        <button className={`section-tab ${activeTab === 'overdue' ? 'active' : ''}`} onClick={() => setActiveTab('overdue')}>المتأخرات</button>
      </div>

      {/* Income vs Expenses */}
      {activeTab === 'income' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 20 }}>الدخل مقابل المصروفات (آخر 12 شهر)</h3>
          {allMonths.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><p>لا توجد بيانات كافية</p></div>
          ) : (
            <div>
              {allMonths.map(ym => {
                const [y, m] = ym.split('-');
                const income = incomeExpenses?.income?.find(i => i.year === Number(y) && i.month === Number(m));
                const expense = incomeExpenses?.expenses?.find(e => e.year === Number(y) && e.month === Number(m));
                const incAmt = income?.totalIncome || 0;
                const expAmt = expense?.totalExpenses || 0;
                const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
                const label = `${monthNames[Number(m) - 1]} ${y}`;
                return (
                  <div key={ym} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{label}</div>
                    <Bar value={incAmt} max={maxIncome} color="#34d399" label="الدخل" />
                    <Bar value={expAmt} max={Math.max(maxIncome, maxExpense)} color="#f87171" label="المصروفات" />
                    <div style={{ fontSize: 12, color: incAmt >= expAmt ? '#34d399' : '#f87171', marginTop: 2, marginRight: 110 }}>
                      {incAmt >= expAmt ? `صافي الربح: ${formatCurrency(incAmt - expAmt)}` : `صافي الخسارة: ${formatCurrency(expAmt - incAmt)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Occupancy */}
      {activeTab === 'occupancy' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 20 }}>إحصائيات الإشغال</h3>
          {summary && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>نسبة الإشغال</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: '#60a5fa' }}>{summary.occupancyRate}%</span>
                </div>
                <div style={{ height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${summary.occupancyRate}%`, height: '100%', background: 'linear-gradient(90deg, #4f8cff, #60a5fa)', borderRadius: 6, transition: 'width 0.5s ease' }} />
                </div>
              </div>
              <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat-card">
                  <span className="stat-label">إجمالي الوحدات</span>
                  <span className="stat-value">{summary.totalUnits}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">الوحدات المؤجرة</span>
                  <span className="stat-value" style={{ color: '#34d399' }}>{summary.occupiedUnits}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">الوحدات الشاغرة</span>
                  <span className="stat-value" style={{ color: '#94a3b8' }}>{summary.totalUnits - summary.occupiedUnits}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">عدد العقارات</span>
                  <span className="stat-value">{summary.totalProperties}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overdue */}
      {activeTab === 'overdue' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 20 }}>الفواتير المتأخرة</h3>
          {overdue.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <p style={{ color: '#34d399' }}>✓ لا توجد فواتير متأخرة</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الفاتورة</th>
                    <th>المستأجر</th>
                    <th>الوحدة</th>
                    <th>المبلغ</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                    <th>تاريخ الاستحقاق</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600, fontSize: 13, color: '#94a3b8' }}>{inv.invoiceNumber}</td>
                      <td>{inv.tenantName}</td>
                      <td className="cell-muted">{inv.unitNumber}</td>
                      <td className="cell-number">{formatCurrency(inv.amount)}</td>
                      <td className="cell-number">{formatCurrency(inv.paidAmount || 0)}</td>
                      <td className="cell-number" style={{ color: '#f87171' }}>{formatCurrency(inv.remaining || inv.amount)}</td>
                      <td className="cell-muted">{inv.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {summary?.unpaidCount > 0 && (
            <div style={{ marginTop: 16, textAlign: 'center', color: '#f87171', fontSize: 14 }}>
              إجمالي المتأخرات: {formatCurrency(summary.overdueAmount)} ريال ({summary.unpaidCount} فاتورة)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
