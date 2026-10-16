import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Drawer, Badge } from '../admin/components';
import { LoadState, PageHeading, useAction, useResource } from './Portal';
import type { Account } from './types';

export default function Accounts() {
  const { user } = useAuth();
  if (!['superadmin', 'manager', 'contractor'].includes(user?.role || '')) return <PageHeading title="Недостаточно прав" text="Аккаунты сотрудников создаёт суперадминистратор." />;
  return <AccountList />;
}
function AccountList() {
  const { user } = useAuth();
  const resource = useResource<Account[]>('/staff/accounts');
  const action = useAction();
  const [creating, setCreating] = useState(false);
  const [reset, setReset] = useState<Account | null>(null);
  const [password, setPassword] = useState('');
  return <><PageHeading title={user?.role === 'contractor' ? 'Моя команда' : 'Аккаунты сотрудников'} text={user?.role === 'contractor' ? 'Создавайте работников и назначайте им задания на своих объектах.' : 'Администратор создаёт субподрядчиков. Других администраторов создаёт только суперадминистратор.'}><button className="ad-button ad-button-primary" onClick={() => setCreating(true)}>Создать аккаунт</button></PageHeading>{action.feedback}
    {resource.error && resource.data && <LoadState error={resource.error} retry={resource.reload} />}
    {!resource.data ? <LoadState error={resource.error} retry={resource.reload} /> : <div className="portal-panel ad-table-wrap"><table className="portal-table" role="table"><thead><tr><th scope="col">Сотрудник</th><th scope="col">Роль</th><th scope="col">Доступ</th><th scope="col">Действия</th></tr></thead><tbody>{resource.data.map(account => <tr key={account.id}>
      <td><strong>{account.name}</strong><span>{account.email}</span></td>
      <td data-label="Роль">{account.role === 'superadmin' ? 'Суперадминистратор' : account.role === 'manager' ? 'Администратор' : account.role === 'contractor' ? 'Субподрядчик' : 'Работник'}</td>
      <td data-label="Доступ"><Badge tone={account.is_active ? 'green' : 'neutral'}>{account.is_active ? 'Активен' : 'Отключён'}</Badge></td>
      <td data-label="Действия">{account.role !== 'superadmin' ? <div className="portal-actions"><button className="ad-button" onClick={() => { setPassword(''); setReset(account); }}>Сменить пароль</button><button className="ad-button" disabled={action.busy} onClick={() => void action.run(async () => { await api(`/staff/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !account.is_active }) }); resource.reload(); })}>{account.is_active ? 'Отключить' : 'Включить'}</button></div> : <span>Настраивается на сервере</span>}</td>
    </tr>)}</tbody></table></div>}
    {creating && <Drawer title="Новый сотрудник" eyebrow="Доступ в систему" close={() => setCreating(false)}><AccountForm onSaved={() => { setCreating(false); resource.reload(); }} /></Drawer>}
    {reset && <Drawer title="Сменить пароль" eyebrow={reset.email} close={() => setReset(null)}><form className="portal-form" onSubmit={async e => { e.preventDefault(); if (await action.run(async () => { await api(`/staff/accounts/${reset.id}`, { method: 'PATCH', body: JSON.stringify({ password }) }); })) { setPassword(''); setReset(null); } }}><p>Текущие сеансы сотрудника завершатся. Передайте новый пароль лично.</p><label className="field">Новый пароль<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>{action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>Сохранить пароль</button></form></Drawer>}
  </>;
}
function AccountForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
    if (await action.run(() => api('/staff/accounts', { method: 'POST', body: JSON.stringify(data) }))) onSaved();
  }
  return <form className="portal-form" onSubmit={submit}><p>Передайте сотруднику email и пароль лично. Письмо автоматически не отправляется.</p>
    <label className="field">Роль<select name="role" aria-label="Роль">{user?.role === 'superadmin' && <option value="manager">Администратор</option>}{user?.role !== 'contractor' && <option value="contractor">Субподрядчик</option>}{['superadmin', 'contractor'].includes(user?.role || '') && <option value="worker">Работник</option>}</select></label>
    <label className="field">Имя<input name="name" required minLength={2} maxLength={160} autoComplete="off" /></label>
    <label className="field">Email<input type="email" name="email" required maxLength={254} autoComplete="off" /></label>
    <label className="field">Телефон<input type="tel" name="phone" required placeholder="+7 700 123 45 67" /></label>
    <label className="field">Компания<input name="company" required minLength={2} maxLength={240} defaultValue="IC Group" /></label>
    <label className="field">Пароль · минимум 12 символов<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    {action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>{action.busy ? 'Создаём…' : 'Создать аккаунт'}</button>
  </form>;
}
