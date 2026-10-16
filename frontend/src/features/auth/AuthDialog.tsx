import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function AuthDialog({ mode, onClose }: { mode: 'login' | 'register' | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [currentMode, setCurrentMode] = useState(mode || 'register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const { authenticate } = useAuth();
  useEffect(() => {
    if (mode) { opener.current = document.activeElement as HTMLElement; setCurrentMode(mode); setError(''); setVisible(false); dialog.current?.showModal(); }
    else { dialog.current?.close(); opener.current?.focus(); }
  }, [mode]);
  useEffect(() => {
    if (!mode) return;
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode, currentMode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    try { await authenticate(currentMode, values); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const register = currentMode === 'register';
  return <dialog className="auth-dialog" ref={dialog} aria-labelledby="auth-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    {mode && <><button type="button" className="quiet-icon close-dialog" onClick={onClose} disabled={busy} aria-label="Закрыть окно"><X size={22} /></button>
      <img className="auth-logo" src="/brand/ic-group.png" alt="IC Group" />
      <h2 id="auth-title">{register ? 'Давайте познакомимся' : 'С возвращением'}</h2>
      <p className="auth-intro">{register ? 'Создайте аккаунт, чтобы IC Group получил вашу заявку и мог связаться с вами.' : 'Войдите, чтобы отправить заявку или посмотреть свои обращения.'} Введённые параметры объекта сохранятся.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="auth-fields">
          {register && <><label className="field">Ваше имя<input name="name" autoComplete="name" required minLength={2} maxLength={160} /></label>
            <label className="field">Компания<input name="company" autoComplete="organization" required minLength={2} maxLength={240} /></label>
            <label className="field">Телефон<input name="phone" type="tel" autoComplete="tel" placeholder="+7 700 123 45 67" required pattern="\+[0-9\s()\-]{10,25}" maxLength={30} /><small>С кодом страны, начиная с +</small></label></>}
          <label className="field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <div className="field"><label htmlFor="account-password">Пароль</label><span className="password-input"><input id="account-password" name="password" aria-describedby={register ? 'password-hint' : undefined} type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={128} /><button type="button" className="quiet-icon" aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{register && <small id="password-hint">От 10 до 128 символов</small>}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="action-button full-width">{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}{!busy && <ArrowRight size={18} />}</button>
        </fieldset>
      </form>
      <p className="auth-switch">{register ? 'Уже есть аккаунт?' : 'Впервые здесь?'} <button type="button" className="text-action" disabled={busy} onClick={() => { setCurrentMode(register ? 'login' : 'register'); setError(''); }}>{register ? 'Войти' : 'Зарегистрироваться'}</button></p>
    </>}
  </dialog>;
}
