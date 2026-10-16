import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Coins, GraduationCap, ShoppingBag, Sparkles, PlusCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeading } from '../portal/Portal';
import './coins.css';

const ways = [
  { id: 'arrival', title: 'Пришёл вовремя', amount: 50, hint: 'Один запрос за смену после подтверждения выхода.', icon: Clock3 },
  { id: 'cleaning', title: 'Выполнил уборку качественно и в срок', amount: 100, hint: 'За весь объём уборки за смену, после приёмки.', icon: Sparkles },
  { id: 'training', title: 'Прошёл обучение по технике уборки', amount: 100, hint: 'Один запрос за пройденный курс.', icon: GraduationCap },
  { id: 'extra', title: 'Выполнил дополнительное задание', amount: null, hint: 'От 50 до 150 монет. Сумму подтверждает руководитель.', icon: PlusCircle },
] as const;
const products = [
  { id: 'juice', title: 'Сок', cost: 300, description: 'Небольшая награда после смены', category: 'Напитки' },
  { id: 'snack', title: 'Кофе и перекус', cost: 500, description: 'Купон номиналом 1 000 ₸', category: 'Купон' },
  { id: 'phone', title: 'Мобильная связь', cost: 1000, description: 'Пополнение на 2 000 ₸', category: 'Связь' },
  { id: 'lunch', title: 'Обед', cost: 1500, description: 'Купон номиналом 3 000 ₸', category: 'Купон' },
  { id: 'home', title: 'Товары для дома', cost: 2000, description: 'Сертификат на 4 000 ₸', category: 'Сертификат' },
  { id: 'groceries-small', title: 'Продукты на каждый день', cost: 2500, description: 'Сертификат на 5 000 ₸', category: 'Сертификат' },
  { id: 'clothes-small', title: 'Одежда и обувь', cost: 3500, description: 'Сертификат на 7 000 ₸', category: 'Сертификат' },
  { id: 'groceries', title: 'Большая продуктовая покупка', cost: 5000, description: 'Сертификат на 10 000 ₸', category: 'Сертификат' },
  { id: 'clothes', title: 'Обновление гардероба', cost: 6000, description: 'Сертификат на 12 000 ₸', category: 'Сертификат' },
];
type BonusRequest = { id: string; way: string; date: string; reference: string; note: string };
type Purchase = { id: string; product: string; cost: number; date: string };
type Wallet = { version: 1; requests: BonusRequest[]; purchases: Purchase[] };
const initialWallet = (): Wallet => ({ version: 1, requests: [], purchases: [] });
const number = (value: number) => value.toLocaleString('ru-RU');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const displayDate = (date: string) => date.split('-').reverse().join('.');
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

function readWallet(key: string): { wallet: Wallet; error: string } {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { wallet: initialWallet(), error: '' };
    const value = JSON.parse(raw) as Wallet;
    if (value.version !== 1 || !Array.isArray(value.requests) || !Array.isArray(value.purchases)
      || !value.requests.every(r => r && typeof r.id === 'string' && ways.some(w => w.id === r.way)
        && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.reference === 'string' && typeof r.note === 'string')
      || !value.purchases.every(p => p && typeof p.id === 'string' && typeof p.date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && products.some(item => item.id === p.product && item.cost === p.cost))
      || value.purchases.reduce((sum, p) => sum + p.cost, 0) > 1500) throw new Error('Invalid demo wallet');
    return { wallet: value, error: '' };
  } catch {
    return { wallet: initialWallet(), error: 'Не удалось прочитать демо-историю. Действия заблокированы, чтобы не перезаписать данные. Разрешите хранилище браузера и перезагрузите страницу.' };
  }
}

export default function CoinsPage() {
  const { user } = useAuth();
  const key = `ic-coins-demo-v1:${user!.id}`;
  const [loaded] = useState(() => readWallet(key));
  const [wallet, setWallet] = useState(loaded.wallet);
  const current = useRef(wallet);
  const [section, setSection] = useState<'request' | 'shop' | null>(null);
  const [way, setWay] = useState<string>('arrival');
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(loaded.error);
  const [notice, setNotice] = useState('');
  const [buying, setBuying] = useState<string | null>(null);
  const [affordable, setAffordable] = useState(false);
  const selected = ways.find(item => item.id === way)!;
  const spent = wallet.purchases.reduce((sum, item) => sum + item.cost, 0);
  const balance = 1500 - spent;
  const formHeading = useRef<HTMLHeadingElement>(null);

  function save(next: Wallet) {
    if (loaded.error) return false;
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      current.current = next;
      setWallet(next);
      setError('');
      return true;
    } catch {
      setError('Не удалось сохранить действие. Баланс не изменён. Разрешите хранилище браузера и попробуйте ещё раз.');
      setNotice('');
      return false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    if (!reference.trim() || !date || date > today()) {
      setError('Укажите выполненное задание и дату не позднее сегодняшней.'); return;
    }
    const duplicate = current.current.requests.some(r => r.way === way && normalize(r.reference) === normalize(reference)
      && (way === 'training' || r.date === date));
    if (duplicate) { setError('Запрос за эту работу уже есть в истории. Повторно отправлять его не нужно.'); return; }
    const request = { id: crypto.randomUUID(), way, date, reference: reference.trim(), note: note.trim() };
    if (save({ ...current.current, requests: [request, ...current.current.requests] })) {
      setNotice('Демо-запрос сохранён: ожидает проверки. Монеты пока не начислены. Руководителю запрос не отправлялся.');
      setReference(''); setNote('');
    }
  }

  function purchase(id: string) {
    if (buying !== id) return;
    const item = products.find(p => p.id === id)!;
    const available = 1500 - current.current.purchases.reduce((sum, p) => sum + p.cost, 0);
    if (available < item.cost) { setError('Недостаточно IC-coins для этой награды.'); setBuying(null); return; }
    const order = { id: crypto.randomUUID(), product: id, cost: item.cost, date: today() };
    if (save({ ...current.current, purchases: [order, ...current.current.purchases] })) {
      setBuying(null);
      setNotice(`«${item.title}»: обмен выполнен в демо. Списано ${number(item.cost)} тестовых IC-coins. Настоящий товар или купон не выдаётся.`);
      requestAnimationFrame(() => document.getElementById(`coins-buy-${id}`)?.focus());
    }
  }

  function open(next: 'request' | 'shop') {
    setSection(next); setBuying(null); setNotice(''); if (!loaded.error) setError('');
    requestAnimationFrame(() => formHeading.current?.focus());
  }

  return <div className="coins-page">
    <PageHeading title="IC-coins" text="Ваш вклад в чистоту — ваши награды." />
    <aside className="coins-demo"><strong>Демонстрационная версия</strong><p>Попробуйте запрос бонусов и магазин с 1 500 тестовыми монетами. Действия сохраняются только в этой вкладке, отдельно для вашего аккаунта. Реальные начисления, отправка руководителю и выдача наград пока не подключены.</p></aside>
    <section className="coins-wallet" aria-label="Кошелёк IC-coins">
      <div><span>Тестовый баланс</span><p className="coins-total" data-testid="coins-balance">{loaded.error ? '—' : number(balance)} <small>IC-coins</small></p><p>1 IC-coin = 2 ₸ в магазине</p></div>
      <dl><div><dt>Эквивалент в магазине</dt><dd>{loaded.error ? '—' : number(balance * 2)} ₸</dd></div><div><dt>Запросов на проверке</dt><dd>{wallet.requests.length}</dd></div><div><dt>Потрачено в демо</dt><dd>{number(spent)} IC-coins</dd></div></dl>
    </section>
    <div className="coins-choices" aria-label="Действия с IC-coins">
      <button className="coins-choice" aria-pressed={section === 'request'} aria-controls="coins-content" onClick={() => open('request')}><Coins aria-hidden="true" size={25} /><span><strong>Запросить бонусы</strong><small>Четыре способа получить IC-coins за работу</small></span><ArrowRight aria-hidden="true" size={20} /></button>
      <button className="coins-choice" aria-pressed={section === 'shop'} aria-controls="coins-content" onClick={() => open('shop')}><ShoppingBag aria-hidden="true" size={25} /><span><strong>Магазин</strong><small>От небольшого перекуса до большой покупки</small></span><ArrowRight aria-hidden="true" size={20} /></button>
    </div>
    <div className="coins-feedback"><p role="alert" className="form-error">{error}</p><p role="status" className="portal-notice">{notice}</p></div>
    <div id="coins-content">
      {section === null && <p className="coins-intro">Выберите действие выше. Запрос бонусов не увеличивает баланс до подтверждения качества работы.</p>}
      {section === 'request' && <section className="coins-request"><h2 ref={formHeading} tabIndex={-1}>За что начислить бонусы?</h2><p className="coins-muted">Выберите выполненное действие и укажите детали для проверки.</p>
        <form onSubmit={submit}>
          <fieldset className="coins-ways"><legend className="sr-only">Способ получения бонусов</legend>{ways.map(({ id, title, hint, amount, icon: Icon }) => <label key={id} className="coins-way"><input type="radio" name="bonus-way" value={id} checked={way === id} onChange={() => { setWay(id); setNotice(''); }} /><Icon aria-hidden="true" size={21} /><span><strong>{title}</strong><small>{hint}</small></span><b>{amount === null ? '+50–150' : `+${amount}`}<small>IC-coins</small></b></label>)}</fieldset>
          <div className="coins-form-fields"><label className="field">{way === 'training' ? 'Дата завершения обучения' : 'Дата выполнения'}<input type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label><label className="field">{way === 'training' ? 'Название курса' : way === 'extra' ? 'Объект и дополнительное задание' : 'Объект и номер или время смены'}<input required maxLength={180} value={reference} onChange={e => setReference(e.target.value)} placeholder={way === 'training' ? 'Например, уход за напольными покрытиями' : 'Например, офис на Абая, смена 08:00–16:00'} /></label><label className="field coins-note">Комментарий для проверки <span className="coins-muted">Необязательно</span><textarea maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Что было выполнено и кто может подтвердить результат" /></label></div>
          <div className="coins-submit"><p><strong>{selected.amount === null ? '50–150' : selected.amount} IC-coins</strong> после подтверждения<br /><span className="coins-muted">В демо запрос останется в ожидании проверки.</span></p><button type="submit" className="ad-button ad-button-primary" disabled={!!loaded.error}>Отправить демо-запрос <ArrowRight size={16} aria-hidden="true" /></button></div>
        </form>
      </section>}
      {section === 'shop' && <section><div className="coins-shop-heading"><div><h2 ref={formHeading} tabIndex={-1}>Магазин наград</h2><p className="coins-muted">Выбирайте небольшую награду сейчас или копите на большее. Каталог демонстрационный.</p></div><label className="coins-filter"><input type="checkbox" checked={affordable} onChange={e => { setAffordable(e.target.checked); setBuying(null); }} />Хватает монет</label></div>
        <div className="coins-products">{products.filter(p => !affordable || p.cost <= balance).map(item => <article className="coins-product" key={item.id} aria-label={item.title}><span className="coins-category">{item.category}</span><h3>{item.title}</h3><p className="coins-muted">{item.description}</p><p className="coins-price">{number(item.cost)} <small>IC-coins</small></p>
          {buying === item.id ? <div className="coins-confirm" role="group" aria-label={`Подтверждение: ${item.title}`}><p>Обменять {number(item.cost)} тестовых монет? Останется {number(balance - item.cost)}.</p><div><button className="ad-button ad-button-primary" autoFocus onClick={() => purchase(item.id)}>Подтвердить обмен</button><button className="ad-button" onClick={() => { setBuying(null); requestAnimationFrame(() => document.getElementById(`coins-buy-${item.id}`)?.focus()); }}>Отмена</button></div></div> : <button id={`coins-buy-${item.id}`} className="ad-button" disabled={!!loaded.error || balance < item.cost} onClick={() => { setBuying(item.id); setNotice(''); }}>{balance < item.cost ? `Не хватает ${number(item.cost - balance)}` : 'Обменять'}{balance >= item.cost && <ArrowRight size={16} aria-hidden="true" />}</button>}
        </article>)}</div>
        {affordable && !products.some(p => p.cost <= balance) && <div className="coins-empty"><ShoppingBag aria-hidden="true" /><h3>Пока не хватает монет</h3><p>Самая доступная награда стоит 300 IC-coins.</p><button className="ad-button" onClick={() => setAffordable(false)}>Показать все награды</button></div>}
      </section>}
    </div>
    <section className="coins-history"><h2>Моя история</h2><p className="coins-muted">Демо-запросы и обмены в этой вкладке.</p>
      {!wallet.requests.length && !wallet.purchases.length ? <div className="coins-empty"><CheckCircle2 aria-hidden="true" /><h3>Здесь появятся ваши действия</h3><p>Отправьте первый запрос на бонусы или выберите награду в магазине.</p></div> : <div className="coins-history-columns">
        <div><h3>Запросы на бонусы</h3>{!wallet.requests.length && <p className="coins-muted">Запросов пока нет.</p>}<ul>{wallet.requests.map(r => <li key={r.id}><div><strong>{ways.find(w => w.id === r.way)!.title}</strong><p>{r.reference}</p>{r.note && <p className="coins-muted">{r.note}</p>}<small>{displayDate(r.date)}</small></div><span className="coins-status">Ожидает проверки · демо</span></li>)}</ul></div>
        <div><h3>Покупки</h3>{!wallet.purchases.length && <p className="coins-muted">Покупок пока нет.</p>}<ul>{wallet.purchases.map(p => <li key={p.id}><div><strong>{products.find(item => item.id === p.product)!.title}</strong><p>−{number(p.cost)} IC-coins</p><small>{displayDate(p.date)} · Только демонстрация</small></div><span className="coins-status">Обмен в демо</span></li>)}</ul></div>
      </div>}
    </section>
  </div>;
}
