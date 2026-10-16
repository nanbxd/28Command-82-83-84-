import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, ChevronRight, Factory, Hospital, LockKeyhole, MapPin, Plus, Shapes, ShieldCheck, Store, Trash2, Warehouse } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandFooter, BrandHeader } from '../../components/BrandHeader';
import { AuthDialog } from '../auth/AuthDialog';
import { useAuth } from '../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { draftStorageKey, generalOptions, newObject, newSchedule, objectTypes, payload, readDraft, week, type Draft, type FormObject, type RequestRecord, type Schedule } from './types';

const typeIcons = [Building2, Store, Warehouse, Factory, Hospital, Shapes];
const steps = ['Объекты', 'Услуги', 'Отправка'];
const formatNumber = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const scheduleText = (s: { days: number[]; start_time: string; duration_hours: string | number }) => `${s.days.map(day => week[day - 1]).join(', ')} · с ${s.start_time}, ${s.duration_hours} ч`;

function validateObject(o: FormObject, step: number): string | null {
  if (step === 0) {
    if (!objectTypes.some(t => t.value === o.object_type)) return 'Выберите тип объекта.';
    if ([o.name, o.city, o.segment].some(v => v.trim().length < 2) || o.address.trim().length < 3) return 'Укажите название, сегмент, город и адрес объекта.';
    if (!Number.isFinite(Number(o.area_sqm)) || Number(o.area_sqm) <= 0 || Number(o.area_sqm) > 10_000_000) return 'Укажите площадь от 0 до 10 000 000 м², больше нуля.';
  } else {
    const valid = (s: Schedule) => s.days.length > 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.start_time) && Number(s.duration_hours) > 0 && Number(s.duration_hours) <= 24;
    if (!valid(o.base_schedule)) return 'Укажите дни, время начала и длительность основной уборки.';
    if (o.bathrooms === '' || !Number.isInteger(Number(o.bathrooms)) || Number(o.bathrooms) < 0 || Number(o.bathrooms) > 10000) return 'Укажите количество санузлов. Если их нет, введите 0.';
    if (o.support_positions.some(p => p.role.trim().length < 2 || !Number.isInteger(Number(p.count)) || Number(p.count) < 1 || Number(p.count) > 1000 || !valid(p.schedule))) return 'Заполните должность, количество и полный график каждой позиции поддерживающей уборки.';
  }
  return null;
}

function ScheduleFields({ value, onChange, prefix }: { value: Schedule; onChange: (s: Schedule) => void; prefix: string }) {
  return <div className="schedule-fields"><fieldset className="days-field"><legend>Дни уборки</legend><div className="days-options">{week.map((day, i) => <label key={day} className={value.days.includes(i + 1) ? 'selected' : ''}><input type="checkbox" checked={value.days.includes(i + 1)} aria-label={`${prefix}: ${day}`} onChange={() => onChange({ ...value, days: value.days.includes(i + 1) ? value.days.filter(d => d !== i + 1) : [...value.days, i + 1].sort() })} /><span>{day}</span></label>)}</div></fieldset>
    <div className="field-grid"><label className="field">Начало смены<input aria-label={`${prefix}: начало смены`} type="time" required value={value.start_time} onChange={e => onChange({ ...value, start_time: e.target.value })} /></label><label className="field">Продолжительность, часов<input aria-label={`${prefix}: продолжительность`} type="number" required min="0.25" max="24" step="0.25" value={value.duration_hours} placeholder="Например, 8" onChange={e => onChange({ ...value, duration_hours: e.target.value })} /></label></div>
    {Number(value.duration_hours) > 0 && value.start_time && Number(value.start_time.slice(0, 2)) + Number(value.start_time.slice(3)) / 60 + Number(value.duration_hours) >= 24 && <p className="field-note">Смена заканчивается на следующий день.</p>}
  </div>;
}

export function ObjectReview({ object }: { object: ReturnType<typeof payload>['objects'][number] }) {
  return <div className="review-object"><h3>{object.name}</h3><p><MapPin size={15} aria-hidden="true" />{object.city}, {object.address}</p><dl><div><dt>Тип / сегмент</dt><dd>{objectTypes.find(t => t.value === object.object_type)?.label} · {object.segment}</dd></div><div><dt>Площадь</dt><dd>{formatNumber(object.area_sqm)} м²</dd></div><div><dt>Основная уборка</dt><dd>{scheduleText(object.base_schedule)}</dd></div><div><dt>Поддерживающая</dt><dd>{object.support_positions.length ? object.support_positions.map((p, i) => <span className="review-position" key={i}>{p.role} × {p.count} · {scheduleText(p.schedule)}</span>) : 'Не требуется'}</dd></div><div><dt>Санузлы / материалы</dt><dd>{object.bathrooms} · {object.hygiene_materials ? 'Гигиенические материалы нужны' : 'Без гигиенических материалов'}</dd></div><div><dt>Генеральная уборка</dt><dd>{generalOptions.find(g => g.value === object.general_cleaning)?.label}</dd></div>{object.notes && <div><dt>Пожелания</dt><dd className="preserve-lines">{object.notes}</dd></div>}</dl></div>;
}

export function RequestPage() {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [activeObject, setActiveObject] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [storageWorks, setStorageWorks] = useState(true);
  const [sending, setSending] = useState(false);
  const { user, loading, error: accountError, refresh, expire } = useAuth();
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const object = draft.objects[activeObject] || draft.objects[0];
  useEffect(() => { try { localStorage.setItem(draftStorageKey, JSON.stringify(draft)); setStorageWorks(true); } catch { setStorageWorks(false); } }, [draft]);
  useEffect(() => {
    if (!error) return;
    errorSummary.current?.focus({ preventScroll: true });
    errorSummary.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [error, activeObject, draft.step]);
  function updateObject(change: Partial<FormObject>) { setDraft(d => ({ ...d, objects: d.objects.map((o, i) => i === activeObject ? { ...o, ...change } : o) })); setError(''); }
  function changeStep(step: number) { setDraft(d => ({ ...d, step })); setError(''); requestAnimationFrame(() => { panelTitle.current?.focus({ preventScroll: true }); document.getElementById('request-progress')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }); }
  function checkStep(step: number) {
    for (let i = 0; i < draft.objects.length; i++) {
      const problem = validateObject(draft.objects[i], step);
      if (problem) { setActiveObject(i); setDraft(d => ({ ...d, step })); setError(`Объект ${i + 1}: ${problem}`); return false; }
    }
    return true;
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setConflict(false);
    if (draft.step < 2) { if (checkStep(draft.step)) { setActiveObject(0); changeStep(draft.step + 1); } return; }
    if (!checkStep(0) || !checkStep(1)) return;
    if (!user) { setAuthMode('register'); return; }
    setSending(true);
    try {
      const record = await api<RequestRecord>('/requests', { method: 'POST', body: JSON.stringify({ idempotency_key: draft.key, details: payload(draft) }) });
      try { localStorage.removeItem(draftStorageKey); } catch { /* Receipt still confirms server persistence. */ }
      navigate(`/requests/${record.id}`, { state: { justSent: true } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { expire(); setAuthMode('login'); setError('Сессия завершилась. Войдите снова — заявка сохранена.'); }
      else if (e instanceof ApiError && e.status === 409) { setConflict(true); setError('Предыдущая версия этой заявки уже сохранена. Посмотрите её в «Моих заявках» или создайте отдельную заявку с изменёнными параметрами.'); }
      else setError((e as Error).message);
    } finally { setSending(false); }
  }
  const totalArea = draft.objects.reduce((sum, o) => sum + (Number(o.area_sqm) || 0), 0);
  return <div className="request-shell"><BrandHeader onLogin={() => setAuthMode('login')} />
    <main id="request-main" className="request-main">
      <div className="request-intro"><h1>ЧИСТОТА НАЧИНАЕТСЯ<br /><span>С ВАШЕГО ОБЪЕКТА</span></h1><p>Расскажите о пространстве и задачах.<br />Мы подготовим предложение для вашего бизнеса.</p></div>
      <nav id="request-progress" className="request-progress" aria-label="Этапы заявки">{steps.map((label, i) => <button key={label} type="button" aria-current={draft.step === i ? 'step' : undefined} disabled={i > draft.step || sending} onClick={() => changeStep(i)}><span className={`step-number ${i < draft.step ? 'complete' : ''}`}>{i < draft.step ? <Check size={17} /> : i + 1}</span><span>{label}</span>{i < 2 && <ChevronRight size={16} className="step-chevron" />}</button>)}<span className="draft-indicator"><span />{storageWorks ? 'Черновик на этом устройстве' : 'Черновик только в этой вкладке'}</span></nav>
      <div className="request-grid"><form className="request-form" onSubmit={submit}>
        <fieldset disabled={sending} className="request-form-content">
          <div className="form-heading"><div><h2 ref={panelTitle} tabIndex={-1}>{['Расскажите об объекте', 'Настроим уборку под вас', 'Всё готово к отправке'][draft.step]}</h2><p>{['Добавьте каждый объект — у него будут свои параметры.', 'Укажите график и состав услуг для каждого объекта.', 'Проверьте параметры. Менеджер получит их вместе с вашими контактами.'][draft.step]}</p></div><span className="step-caption">{draft.step + 1} / 3</span></div>
          {draft.step < 2 && <div className="object-tabs" aria-label="Объекты заявки">{draft.objects.map((o, i) => <button type="button" key={o.key} aria-pressed={activeObject === i} onClick={() => { setActiveObject(i); setError(''); }}>Объект {i + 1}</button>)}{draft.step === 0 && <button type="button" className="add-object" disabled={draft.objects.length >= 20} onClick={() => { setDraft(d => ({ ...d, objects: [...d.objects, newObject()] })); setActiveObject(draft.objects.length); }}><Plus size={16} />Добавить</button>}</div>}
          {error && <div className="form-error" role="alert" ref={errorSummary} tabIndex={-1}><p>{error}</p>{conflict && <div className="conflict-actions"><Link className="text-action" to="/requests">Посмотреть мои заявки</Link><button type="button" className="outline-button" onClick={() => { setDraft(d => ({ ...d, key: crypto.randomUUID() })); setConflict(false); setError(''); }}>Создать новую заявку с этими параметрами</button></div>}</div>}
          {draft.step === 0 && <>
            <fieldset className="object-type-field"><legend>Тип объекта <span aria-hidden="true">*</span></legend><div className="object-types">{objectTypes.map(({ value, label }, i) => { const Icon = typeIcons[i]; return <label key={value} className={object.object_type === value ? 'chosen' : ''}><input type="radio" name="object_type" value={value} required checked={object.object_type === value} onChange={() => updateObject({ object_type: value })} /><Icon size={23} aria-hidden="true" /><span>{label}</span><span className="choice-mark">{object.object_type === value && <Check size={12} />}</span></label>; })}</div></fieldset>
            <div className="field-grid"><label className="field">Название объекта *<input required minLength={2} maxLength={160} placeholder="Например, офис на Абая" value={object.name} onChange={e => updateObject({ name: e.target.value })} /></label><label className="field">Сегмент бизнеса *<input required minLength={2} maxLength={120} list="business-segments" placeholder="Выберите или укажите свой" value={object.segment} onChange={e => updateObject({ segment: e.target.value })} /><datalist id="business-segments">{['Бизнес-центр', 'Розничная торговля', 'Банки и финансы', 'Логистика', 'Промышленность', 'Медицина', 'Образование', 'Гостиницы и рестораны'].map(v => <option key={v} value={v} />)}</datalist></label></div>
            <div className="field-grid"><label className="field">Город *<input required minLength={2} maxLength={120} list="cities" placeholder="Выберите или введите город" value={object.city} onChange={e => updateObject({ city: e.target.value })} /><datalist id="cities">{['Алматы', 'Астана', 'Шымкент', 'Караганда', 'Актобе', 'Атырау', 'Актау', 'Павлодар', 'Костанай', 'Усть-Каменогорск'].map(v => <option key={v} value={v} />)}</datalist></label><label className="field">Площадь, м² *<input type="number" required min="0.01" max="10000000" step="0.01" placeholder="Например, 1 500" value={object.area_sqm} onChange={e => updateObject({ area_sqm: e.target.value })} /></label></div>
            <label className="field">Адрес объекта *<input required minLength={3} maxLength={300} placeholder="Улица, дом, этаж или территория" value={object.address} onChange={e => updateObject({ address: e.target.value })} /></label>
            {draft.objects.length > 1 && <button type="button" className="text-action danger" onClick={() => { setDraft(d => ({ ...d, objects: d.objects.filter((_, i) => i !== activeObject) })); setActiveObject(Math.max(0, activeObject - 1)); }}><Trash2 size={15} />Удалить объект {activeObject + 1}</button>}
            <p className="field-note">* Обязательные поля. Можно добавить до 20 объектов.</p>
          </>}
          {draft.step === 1 && <><div className="object-context"><Building2 size={19} /><strong>{object.name}</strong><span>{object.city} · {formatNumber(Number(object.area_sqm))} м²</span></div>
            <section className="service-section"><h3>Основная уборка</h3><p>Все поля графика обязательны. Укажите удобное время начала.</p><ScheduleFields prefix="Основная уборка" value={object.base_schedule} onChange={base_schedule => updateObject({ base_schedule })} /></section>
            <section className="service-section"><h3>Поддерживающая уборка</h3><p>Нужны сотрудники в течение дня? Добавьте позиции и их графики.</p>
              {object.support_positions.map((position, i) => <div className="support-position" key={position.key}><div className="support-heading"><strong>Позиция {i + 1}</strong><button type="button" className="quiet-icon" aria-label={`Удалить позицию ${i + 1}`} onClick={() => updateObject({ support_positions: object.support_positions.filter((_, j) => j !== i) })}><Trash2 size={17} /></button></div><div className="field-grid"><label className="field">Должность<input required minLength={2} maxLength={160} placeholder="Например, уборщик помещений" value={position.role} onChange={e => updateObject({ support_positions: object.support_positions.map((p, j) => j === i ? { ...p, role: e.target.value } : p) })} /></label><label className="field">Количество сотрудников<input type="number" required min="1" max="1000" value={position.count} onChange={e => updateObject({ support_positions: object.support_positions.map((p, j) => j === i ? { ...p, count: e.target.value } : p) })} /></label></div><ScheduleFields prefix={`Позиция ${i + 1}`} value={position.schedule} onChange={schedule => updateObject({ support_positions: object.support_positions.map((p, j) => j === i ? { ...p, schedule } : p) })} /></div>)}
              <button className="outline-button" type="button" disabled={object.support_positions.length >= 10} onClick={() => updateObject({ support_positions: [...object.support_positions, { key: crypto.randomUUID(), role: '', count: '1', schedule: newSchedule() }] })}><Plus size={17} />Добавить позицию</button></section>
            <section className="service-section"><h3>Детали уборки</h3><div className="field-grid"><label className="field">Количество санузлов *<input required type="number" min="0" max="10000" placeholder="0, если нет" value={object.bathrooms} onChange={e => updateObject({ bathrooms: e.target.value })} /></label><label className="field">Генеральная уборка<select aria-label="Генеральная уборка" value={object.general_cleaning} onChange={e => updateObject({ general_cleaning: e.target.value })}>{generalOptions.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label></div><label className="check-field"><input type="checkbox" checked={object.hygiene_materials} onChange={e => updateObject({ hygiene_materials: e.target.checked })} /><span>Включить гигиенические материалы<small>Мыло, туалетную бумагу и другие расходные материалы</small></span></label><label className="field">Особые пожелания <span className="optional">необязательно</span><textarea maxLength={2000} rows={3} value={object.notes} onChange={e => updateObject({ notes: e.target.value })} placeholder="Особенности помещений, покрытия, доступ на объект…" /></label></section>
          </>}
          {draft.step === 2 && <><div className="review-list">{payload(draft).objects.map((o, i) => <ObjectReview key={draft.objects[i].key} object={o} />)}</div><div className="field-grid"><label className="field">Желаемое начало <span className="optional">необязательно</span><input type="date" value={draft.desired_start} onChange={e => setDraft(d => ({ ...d, desired_start: e.target.value }))} /></label><label className="field">Бюджет в месяц, ₸ <span className="optional">необязательно</span><input type="number" min="1" max="1000000000000" placeholder="Можно обсудить с менеджером" value={draft.monthly_budget} onChange={e => setDraft(d => ({ ...d, monthly_budget: e.target.value }))} /></label></div>
            {accountError && <p className="form-error" role="alert">{accountError} <button type="button" className="text-action" onClick={() => void refresh()}>Повторить вход</button></p>}
            <div className="identity-notice">{user ? <><ShieldCheck size={22} /><div><h3>Контакты для IC Group</h3><strong>{user.name} · {user.company}</strong><p>{user.email} · {user.phone}</p></div></> : <><LockKeyhole size={22} /><div><h3>Остался один шаг — познакомиться</h3><p>Для отправки нужен аккаунт. Все параметры сохранятся при регистрации. Уже зарегистрированы? <button type="button" className="text-action" onClick={() => setAuthMode('login')}>Войдите</button></p></div></>}</div>
            <p className="field-note">Отправляя заявку, вы передаёте указанные параметры и контакты IC Group для подготовки предложения и связи с вами. Отправка не заключает договор.</p></>}
        </fieldset>
        <div className="form-actions">{draft.step > 0 ? <button type="button" className="back-button" disabled={sending} onClick={() => changeStep(draft.step - 1)}><ArrowLeft size={17} />Назад</button> : <span className="no-account-note"><LockKeyhole size={15} />Заполняйте без регистрации</span>}<button type="submit" className="action-button" disabled={sending || loading}>{sending ? 'Отправляем…' : draft.step < 2 ? 'Продолжить' : user ? 'Отправить заявку' : 'Зарегистрироваться и продолжить'}{!sending && <ArrowRight size={18} />}</button></div>
      </form><aside className="request-aside" aria-label="Сводка заявки"><div className="request-summary"><div className="summary-heading"><h2>Ваша заявка</h2><span className="live-dot" /></div><p className="summary-description">Каждый объект —<br />свой подход к чистоте.</p><dl className="request-totals"><div><dt>Объектов</dt><dd>{draft.objects.length.toString().padStart(2, '0')}</dd></div><div><dt>Общая площадь</dt><dd>{totalArea ? formatNumber(totalArea) : '—'} <small>м²</small></dd></div></dl><ul className="summary-objects">{draft.objects.map((o, i) => <li key={o.key}><Building2 size={18} /><div><strong>{o.name || `Объект ${i + 1}`}</strong><span>{[o.city, objectTypes.find(t => t.value === o.object_type)?.label].filter(Boolean).join(' · ') || 'Укажите тип и локацию'}</span></div></li>)}</ul><div className="summary-next"><span>Что дальше</span><p>Менеджер уточнит детали и подготовит расчёт стоимости. Окончательные условия согласуем в договоре.</p></div></div><div className="draft-note"><ShieldCheck size={22} /><p>{storageWorks ? 'Можно вернуться позже. Черновик останется в этом браузере.' : 'Хранилище браузера недоступно. Не закрывайте вкладку до отправки.'}</p></div></aside></div>
    </main><BrandFooter /><AuthDialog mode={authMode} onClose={() => setAuthMode(null)} />
  </div>;
}
