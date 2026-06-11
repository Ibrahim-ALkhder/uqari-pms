import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data.data.token;
      localStorage.setItem('auth_token', token);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'فشل تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">◈</span>
          <span className="login-brand-text">عقاري</span>
          <span className="login-brand-sub">نظام إدارة العقارات</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">البريد الإلكتروني</label>
            <input
              className="login-input"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@domain.com"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">كلمة المرور</label>
            <input
              className="login-input"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'جاري تسجيل الدخول…' : 'تسجيل الدخول'}
          </button>
        </form>

      </div>
    </div>
  );
}
