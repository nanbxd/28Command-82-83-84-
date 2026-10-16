import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BrandFooter, BrandHeader } from '../../components/BrandHeader';
import { AuthDialog } from '../auth/AuthDialog';
import { useAuth } from '../auth/AuthProvider';
import AdminPage from './AdminPage';

export default function StaffPage() {
  const { user, loading, error, refresh } = useAuth();
  const { section = 'requests' } = useParams();
  const [login, setLogin] = useState(false);
  if (user?.role === 'manager' && !loading && !error) {
    if (section === 'projects' || section === 'complaints') return <Navigate to={`/demo/admin/${section}`} replace />;
    if (section !== 'requests') return <Navigate to="/admin/requests" replace />;
    return <AdminPage key={user.id} />;
  }
  return <div className="request-shell">
    <BrandHeader onLogin={() => setLogin(true)} />
    <main id="request-main" className="requests-main">
      <section className="request-empty">
        <h1>{loading ? 'Проверяем доступ…' : error ? 'Не удалось проверить доступ' : user ? 'Кабинет доступен сотрудникам IC Group' : 'Вход для сотрудников IC Group'}</h1>
        {loading ? <p role="status">Загружаем профиль.</p> : error ? <><p role="alert">{error}</p><button className="action-button" onClick={() => void refresh()}>Повторить</button></> : user ? <><p>Для обработки заявок нужна роль сотрудника. Доступ выдаёт администратор системы.</p><Link className="action-button" to="/requests">Мои заявки</Link></> : <><p>Войдите в аккаунт сотрудника, чтобы увидеть клиентские заявки.</p><button className="action-button" onClick={() => setLogin(true)}>Войти</button></>}
        <p><Link to="/demo/admin">Открыть демонстрацию кабинета</Link></p>
      </section>
    </main>
    <BrandFooter /><AuthDialog mode={login ? 'login' : null} onClose={() => setLogin(false)} />
  </div>;
}
