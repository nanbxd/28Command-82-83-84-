import { useEffect, useState } from 'react';

export interface ServiceObject {
  id: string; name: string; scope: string; city: string; area_sqm: number;
  contract_number: string; contract_status: string;
}
export interface WorkGroup {
  role: string; start: string; end: string; ends_next_day: boolean;
  planned: number; with_marks: number; checklist_recorded: number;
}
export interface Overview {
  organization: string; is_demo: boolean; period_start: string; period_end: string;
  selected_date: string; objects: ServiceObject[]; total_area_sqm: number;
  planned_shifts: number; shifts_with_marks: number;
  days: { date: string; planned: number; with_marks: number }[];
  work_groups: WorkGroup[];
  sources: { file: string; sheet: string; rows: string; purpose: string }[];
}

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function useOverview(day: string | undefined) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 15000);
    setLoading(true);
    setError(null);
    async function fetchOverview() {
      try {
        const query = day ? `?day=${encodeURIComponent(day)}` : '';
        const response = await fetch(`${base}/api/v1/demo/overview${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404
          ? 'Демонстрационный кабинет сейчас недоступен.'
          : response.status === 422 ? 'За эту дату нет доступного плана работ.'
          : 'Не удалось получить данные кабинета.');
        const result: Overview = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (reason) {
        if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
        setError(controller.signal.reason === 'timeout'
          ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
          : reason instanceof TypeError ? 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.'
          : reason instanceof Error ? reason.message : 'Не удалось загрузить кабинет.');
      } finally {
        clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setLoading(false);
      }
    }
    void fetchOverview();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [day, attempt]);

  return { data, loading, error, retry: () => setAttempt(value => value + 1) };
}
