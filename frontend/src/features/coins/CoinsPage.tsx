import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Coins, ShoppingBag } from 'lucide-react';
import { api } from '../../lib/api';
import { LoadState, PageHeading, useAction } from '../portal/Portal';
import { displayDate, number, statusLabels, today, useCoinsResource, ways, type Wallet } from './shared';
import './coins.css';

export default function CoinsPage() {
  const resource = useCoinsResource<Wallet>('/coins/wallet');
  const action = useAction();
  const [section, setSection] = useState<'request' | 'shop' | null>(null);
  const [way, setWay] = useState<string>('arrival');
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [buying, setBuying] = useState<{ id: string; key: string } | null>(null);
  const [affordable, setAffordable] = useState(false);
  const selected = ways.find(item => item.id === way)!;
  const formHeading = useRef<HTMLHeadingElement>(null);
  const sending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    try {
      const ok = await action.run(async () => {
        await api('/coins/requests', { method: 'POST', body: JSON.stringify({ way, date, reference: reference.trim(), note: note.trim() }) });
        resource.reload();
      }, 'Запрос отправлен вашему субподрядчику. Монеты поступят после подтверждения.');
      if (ok) { setReference(''); setNote(''); }
    } finally { sending.current = false; }
  }

  async function purchase() {
    if (!buying || sending.current) return;
    sending.current = true;
    try {
      const ok = await action.run(async () => {
        await api('/coins/purchases', { method: 'POST', body: JSON.stringify({ product_id: buying.id, idempotency_key: buying.key }) });
        resource.reload();
      }, 'Заказ сохранён, IC-coins списаны. Награда ожидает выдачи; автоматическая выдача купонов пока не подключена.');
      if (ok) { const id = buying.id; setBuying(null); requestAnimationFrame(() => document.getElementById(`coins-buy-${id}`)?.focus()); }
    } finally { sending.current = false; }
  }

  function open(next: 'request' | 'shop') {
    setSection(next);
    requestAnimationFrame(() => formHeading.current?.focus());
  }

  const wallet = resource.data;
  if (!wallet) return <><PageHeading title="IC-coins" text="Ваш вклад в чистоту — ваши награды." /><LoadState error={resource.error} retry={resource.reload} /></>;
  const { balance, products } = wallet;
  return <div className="coins-page">
    <PageHeading title="IC-coins" text="Ваш вклад в чистоту — ваши награды."><button className="ad-button" onClick={resource.reload}>Обновить баланс</button></PageHeading>
    {resource.error && <p className="form-error" role="alert">{resource.error} Показаны последние загруженные данные. <button className="ad-button" onClick={resource.reload}>Повторить</button></p>}
    <aside className="coins-demo"><strong>Бонусы за вашу работу</strong><p>Каждому новому работнику — 1 000 стартовых IC-coins при создании аккаунта. Запросы подтверждает создавший ваш аккаунт субподрядчик{wallet.contractor_name ? `: ${wallet.contractor_name}` : ''}. Баланс обновляется автоматически каждые 10 секунд.</p></aside>
    <section className="coins-wallet" aria-label="Кошелёк IC-coins">
      <div><span>Ваш баланс</span><p className="coins-total" data-testid="coins-balance">{number(balance)} <small>IC-coins</small></p><p>1 IC-coin = {wallet.rate} ₸ в магазине</p></div>
      <dl><div><dt>Эквивалент в магазине</dt><dd>{number(balance * wallet.rate)} ₸</dd></div><div><dt>Запросов на проверке</dt><dd>{wallet.pending}</dd></div><div><dt>Получено за работу</dt><dd>{number(wallet.earned)} IC-coins</dd></div></dl>
    </section>
    <div className="coins-choices" aria-label="Действия с IC-coins">
      <button className="coins-choice" aria-pressed={section === 'request'} aria-controls="coins-content" onClick={() => open('request')}><Coins aria-hidden="true" size={25} /><span><strong>Запросить бонусы</strong><small>Четыре способа получить IC-coins за работу</small></span><ArrowRight aria-hidden="true" size={20} /></button>
      <button className="coins-choice" aria-pressed={section === 'shop'} aria-controls="coins-content" onClick={() => open('shop')}><ShoppingBag aria-hidden="true" size={25} /><span><strong>Магазин</strong><small>От небольшого перекуса до большой покупки</small></span><ArrowRight aria-hidden="true" size={20} /></button>
    </div>
    <div className="coins-feedback">{action.feedback}</div>
    <div id="coins-content">
      {section === null && <p className="coins-intro">Выберите действие выше. Бонусы поступают на баланс только после подтверждения субподрядчиком.</p>}
      {section === 'request' && <section className="coins-request"><h2 ref={formHeading} tabIndex={-1}>За что начислить бонусы?</h2><p className="coins-muted">Выберите выполненное действие и укажите детали для проверки.</p>
        {!wallet.can_request && <p className="form-error" role="alert">У вашего аккаунта нет активного субподрядчика для проверки бонусов. Обратитесь к администратору.</p>}
        <form onSubmit={submit}>
          <fieldset className="coins-ways" disabled={action.busy || !wallet.can_request}><legend className="sr-only">Способ получения бонусов</legend>{ways.map(({ id, title, hint, amount, icon: Icon }) => <label key={id} className="coins-way"><input type="radio" name="bonus-way" value={id} checked={way === id} onChange={() => setWay(id)} /><Icon aria-hidden="true" size={21} /><span><strong>{title}</strong><small>{hint}</small></span><b>{amount === null ? '+50–150' : `+${amount}`}<small>IC-coins</small></b></label>)}</fieldset>
          <div className="coins-form-fields"><label className="field">{way === 'training' ? 'Дата завершения обучения' : 'Дата выполнения'}<input type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} disabled={action.busy} /></label><label className="field">{way === 'training' ? 'Название курса' : way === 'extra' ? 'Объект и дополнительное задание' : 'Объект и номер или время смены'}<input required maxLength={180} value={reference} onChange={e => setReference(e.target.value)} disabled={action.busy} placeholder={way === 'training' ? 'Например, уход за напольными покрытиями' : 'Например, офис на Абая, смена 08:00–16:00'} /></label><label className="field coins-note">Комментарий для проверки <span className="coins-muted">Необязательно</span><textarea maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} disabled={action.busy} placeholder="Что было выполнено и кто может подтвердить результат" /></label></div>
          <div className="coins-submit"><p><strong>{selected.amount === null ? '50–150' : selected.amount} IC-coins</strong> после подтверждения<br /><span className="coins-muted">Решение субподрядчика появится в истории.</span></p><button type="submit" className="ad-button ad-button-primary" disabled={action.busy || !wallet.can_request}>Отправить запрос <ArrowRight size={16} aria-hidden="true" /></button></div>
        </form>
      </section>}
      {section === 'shop' && <section><div className="coins-shop-heading"><div><h2 ref={formHeading} tabIndex={-1}>Магазин наград</h2><p className="coins-muted">Монеты списываются при подтверждении заказа. Автоматическая выдача товаров и купонов пока не подключена.</p></div><label className="coins-filter"><input type="checkbox" checked={affordable} onChange={e => setAffordable(e.target.checked)} />Хватает монет</label></div>
        <div className="coins-products">{products.filter(p => !affordable || p.cost <= balance || buying?.id === p.id).map(item => <article className="coins-product" key={item.id} aria-label={item.title}><span className="coins-category">{item.category}</span><h3>{item.title}</h3><p className="coins-muted">{item.description}</p><p className="coins-price">{number(item.cost)} <small>IC-coins</small></p>
          {buying?.id === item.id ? <div className="coins-confirm" role="group" aria-label={`Подтверждение: ${item.title}`}><p>{balance >= item.cost ? `Обменять ${number(item.cost)} монет? Останется ${number(balance - item.cost)}.` : 'Баланс изменился. На эту награду пока не хватает монет.'}</p><div><button className="ad-button ad-button-primary" autoFocus disabled={action.busy || balance < item.cost} onClick={() => void purchase()}>Подтвердить обмен</button><button className="ad-button" disabled={action.busy} onClick={() => { setBuying(null); requestAnimationFrame(() => document.getElementById(`coins-buy-${item.id}`)?.focus()); }}>Отмена</button></div></div> : <button id={`coins-buy-${item.id}`} className="ad-button" disabled={action.busy || balance < item.cost || buying !== null} onClick={() => setBuying({ id: item.id, key: crypto.randomUUID() })}>{balance < item.cost ? `Не хватает ${number(item.cost - balance)}` : 'Обменять'}{balance >= item.cost && <ArrowRight size={16} aria-hidden="true" />}</button>}
        </article>)}</div>
        {affordable && !buying && !products.some(p => p.cost <= balance) && <div className="coins-empty"><ShoppingBag aria-hidden="true" /><h3>Пока не хватает монет</h3><p>Самая доступная награда стоит 300 IC-coins.</p><button className="ad-button" onClick={() => setAffordable(false)}>Показать все награды</button></div>}
      </section>}
    </div>
    <section className="coins-history"><h2>Моя история</h2><p className="coins-muted">Последние 100 запросов и 100 операций. Потрачено: {number(wallet.spent)} IC-coins.</p>
      {!wallet.requests.length && !wallet.transactions.length ? <div className="coins-empty"><CheckCircle2 aria-hidden="true" /><h3>Здесь появятся ваши действия</h3><p>Отправьте первый запрос на бонусы.</p></div> : <div className="coins-history-columns">
        <div><h3>Запросы на бонусы</h3>{!wallet.requests.length && <p className="coins-muted">Запросов пока нет.</p>}<ul>{wallet.requests.map(r => <li key={r.id}><div><strong>{ways.find(w => w.id === r.way)?.title}</strong><p>{r.reference}</p>{r.note && <p className="coins-muted">{r.note}</p>}{r.decision_note && <p>Решение: {r.decision_note}</p>}<small>{displayDate(r.date)}{r.status === 'approved' && ` · +${r.amount} IC-coins`}</small></div><span className="coins-status" data-status={r.status}>{statusLabels[r.status]}</span></li>)}</ul></div>
        <div><h3>Движение монет</h3>{!wallet.transactions.length && <p className="coins-muted">Операций пока нет.</p>}<ul>{wallet.transactions.map(t => <li key={t.id}><div><strong>{t.description}</strong><p>{t.amount > 0 ? '+' : '−'}{number(Math.abs(t.amount))} IC-coins</p><small>{displayDate(t.created_at)}</small></div><span className="coins-status">{t.kind === 'purchase' ? 'Ожидает выдачи' : 'Начислено'}</span></li>)}</ul></div>
      </div>}
    </section>
  </div>;
}
