import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './components/pages/Login';
import Dashboard from './components/pages/Dashboard';
import Settings from './components/pages/Settings';
import Properties from './components/pages/Properties';
import PropertyDetails from './components/pages/PropertyDetails';
import UnitForm from './components/pages/UnitForm';
import Tenants from './components/pages/Tenants';
import ContractDetails from './components/pages/ContractDetails';
import Invoices from './components/pages/Invoices';
import Expenses from './components/pages/Expenses';
import Maintenance from './components/pages/Maintenance';
import Reports from './components/pages/Reports';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('auth_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const token = localStorage.getItem('auth_token');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:id" element={<PropertyDetails />} />
          <Route path="/units/new" element={<UnitForm />} />
          <Route path="/units/:id/edit" element={<UnitForm />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/contracts/new" element={<ContractDetails />} />
          <Route path="/contracts/:id" element={<ContractDetails />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
