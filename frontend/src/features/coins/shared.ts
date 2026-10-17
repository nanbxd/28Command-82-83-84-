import { useEffect, useRef } from 'react';
import { Clock3, GraduationCap, PlusCircle, Sparkles } from 'lucide-react';
import { useResource } from '../portal/Portal';

export const ways = [
  { id: 'arrival', title: 'Пришёл вовремя', amount: 50, hint: 'Один запрос за смену после подтверждения выхода.', icon: Clock3 },
  { id: 'cleaning', title: 'Выполнил уборку качественно и в срок', amount: 100, hint: 'За весь объём уборки за смену, после приёмки.', icon: Sparkles },
  { id: 'training', title: 'Прошёл обучение по технике уборки', amount: 100, hint: 'Один запрос за пройденный курс.', icon: GraduationCap },
  { id: 'extra', title: 'Выполнил дополнительное задание', amount: null, hint: 'От 50 до 150 монет. Сумму подтверждает субподрядчик.', icon: PlusCircle },
] as const;
export type BonusRequest = { id: string; worker_id: string; worker_name: string | null; way: string; date: string; reference: string; note: string; status: 'pending' | 'approved' | 'rejected'; amount: number | null; decision_note: string; created_at: string; reviewed_at: string | null };
export type Transaction = { id: string; kind: 'welcome' | 'bonus' | 'purchase'; amount: number; description: string; created_at: string; status: string };
export type Product = { id: string; title: string; cost: number; description: string; category: string };
export type Wallet = { balance: number; welcome: number; earned: number; spent: number; pending: number; rate: number; contractor_name: string | null; can_request: boolean; requests: BonusRequest[]; transactions: Transaction[]; products: Product[] };
export const statusLabels = { pending: 'Ожидает проверки', approved: 'Начислено', rejected: 'Отклонено' };
export const number = (value: number) => value.toLocaleString('ru-RU');
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const displayDate = (date: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty' }).format(new Date(date));

export function useCoinsResource<T>(path: string) {
  const resource = useResource<T>(path);
  const reloadRef = useRef(resource.reload);
  useEffect(() => { reloadRef.current = resource.reload; }, [resource.reload]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') reloadRef.current(); };
    const timer = window.setInterval(update, 10000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return resource;
}
