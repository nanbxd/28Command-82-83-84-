import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import { OverviewPage } from './features/overview/OverviewPage';
import '@fontsource-variable/manrope';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/cabinet" replace />} />
        <Route path="/cabinet" element={<OverviewPage />} />
        <Route path="*" element={<main className="not-found"><h1>Страница не найдена</h1><p>Вернитесь к обзору ваших объектов и работ.</p><Link className="button primary" to="/cabinet">Открыть кабинет</Link></main>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
