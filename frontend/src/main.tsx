import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import { OverviewPage } from './features/overview/OverviewPage';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequestPage } from './features/request/RequestPage';
import { RequestsPage } from './features/request/RequestsPage';
import '@fontsource-variable/montserrat';
import './styles.css';
import './request.css';

const AdminPage = React.lazy(() => import('./features/admin/AdminPage'));
const StaffPage = React.lazy(() => import('./features/admin/StaffPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route path="/" element={<RequestPage />} />
        <Route path="/cabinet" element={<Navigate to="/requests" replace />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestsPage />} />
        <Route path="/demo/cabinet" element={<OverviewPage />} />
        <Route path="/admin" element={<Navigate to="/admin/requests" replace />} />
        <Route path="/admin/requests" element={<React.Suspense fallback={<main role="status">Загружаем кабинет IC Group…</main>}><StaffPage /></React.Suspense>} />
        <Route path="/admin/:section" element={<React.Suspense fallback={<main role="status">Загружаем кабинет IC Group…</main>}><StaffPage /></React.Suspense>} />
        <Route path="/demo/admin" element={<Navigate to="/demo/admin/requests" replace />} />
        <Route path="/demo/admin/:section" element={<React.Suspense fallback={<main role="status">Загружаем демо-кабинет…</main>}><AdminPage demo /></React.Suspense>} />
        <Route path="*" element={<main className="not-found"><h1>Страница не найдена</h1><p>Вернитесь к форме заявки или своим обращениям.</p><Link className="button primary" to="/">Новая заявка</Link></main>} />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
