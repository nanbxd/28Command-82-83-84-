import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequestPage } from './features/request/RequestPage';
import { RequestsPage } from './features/request/RequestsPage';
import '@fontsource-variable/montserrat';
import './styles.css';
import './request.css';

const AdminPage = React.lazy(() => import('./features/admin/AdminPage'));
const Portal = React.lazy(() => import('./features/portal/Portal'));
const Projects = React.lazy(() => import('./features/portal/Projects'));
const ProjectPage = React.lazy(() => import('./features/portal/ProjectPage'));
const Accounts = React.lazy(() => import('./features/portal/Accounts'));
const Complaints = React.lazy(() => import('./features/portal/Complaints'));
const CoinsPage = React.lazy(() => import('./features/coins/CoinsPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <React.Suspense fallback={<main role="status">Загружаем кабинет…</main>}><Routes>
        <Route path="/" element={<RequestPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestsPage />} />
        <Route path="/admin" element={<Portal audience="staff" />}>
          <Route index element={<Navigate to="requests" replace />} />
          <Route path="requests" element={<AdminPage />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="accounts" element={<Accounts />} />
        </Route>
        <Route path="/cabinet" element={<Portal audience="client" />}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="complaints" element={<Complaints />} />
        </Route>
        <Route path="/contractor" element={<Portal audience="contractor" />}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="complaints" element={<Complaints />} />
        </Route>
        <Route path="/work" element={<Portal audience="worker" />}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="ic-coins" element={<CoinsPage />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="complaints" element={<Complaints />} />
        </Route>
        <Route path="*" element={<main className="not-found"><h1>Страница не найдена</h1><p>Вернитесь к форме заявки или своим обращениям.</p><Link className="button primary" to="/">Новая заявка</Link></main>} />
      </Routes></React.Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
