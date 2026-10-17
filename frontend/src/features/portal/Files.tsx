import { useEffect, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { preparePhoto } from '../../lib/photos';
import { api, fileBlob } from '../../lib/api';
import { useAction } from './Portal';
import { fileLabels, time, type ServiceFile } from './types';

export function UploadFile({ projectId, kind, visitId, complaintId, period = '', onSaved }: {
  projectId: string; kind: string; visitId?: string; complaintId?: string; period?: string; onSaved: () => void;
}) {
  const action = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState('');
  const [transfer, setTransfer] = useState('');
  const photo = ['before', 'after', 'complaint'].includes(kind);
  return <form className="portal-upload" onSubmit={async e => {
    e.preventDefault(); if (!file) return;
    setTransfer('');
    const params = new URLSearchParams({ kind, name: file.name, period });
    if (visitId) params.set('visit_id', visitId);
    if (complaintId) params.set('complaint_id', complaintId);
    if (await action.run(async () => {
      if (file.size > 8 * 1024 * 1024) throw new Error('Максимальный размер файла — 8 МБ.');
      setStage(photo ? 'Подготавливаем фото…' : 'Загружаем…');
      const payload = photo ? await preparePhoto(file) : file;
      params.set('name', payload.name);
      setTransfer(`Отправляем ${(payload.size / 1024 / 1024).toFixed(2)} МБ${payload.size < file.size ? ` вместо ${(file.size / 1024 / 1024).toFixed(2)} МБ` : ''}.`);
      setStage('Загружаем…');
      return api(`/projects/${projectId}/files?${params}`, { method: 'POST', body: payload });
    }, 'Файл сохранён.')) onSaved();
  }}><label className="field">{fileLabels[kind]} · {photo ? 'JPEG, PNG, WebP' : 'PDF'}, до 8 МБ<input type="file" required disabled={action.busy} accept={photo ? 'image/jpeg,image/png,image/webp' : 'application/pdf'} onChange={e => setFile(e.target.files?.[0] || null)} /></label>
    <button className="ad-button" disabled={!file || action.busy || kind === 'avr' && !period.trim()}><Upload size={16} />{action.busy ? stage || 'Подготавливаем…' : 'Загрузить файл'}</button>{action.busy && <p aria-live="polite">{transfer || 'Проверяем изображение перед отправкой.'}</p>}{action.feedback}</form>;
}
export function DownloadFile({ file }: { file: ServiceFile }) {
  const action = useAction();
  return <div><button className="ad-button" disabled={action.busy} onClick={() => void action.run(async () => {
    const blob = await fileBlob(file.id); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, '')}><Download size={16} />{action.busy ? 'Открываем…' : 'Скачать'}</button>{action.feedback}</div>;
}
function Photo({ file }: { file: ServiceFile }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    setError(''); setUrl('');
    fileBlob(file.id, controller.signal).then(blob => {
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => { if (!controller.signal.aborted) setError('Фото не загрузилось.'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, attempt]);
  return <figure className="portal-photo">{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${fileLabels[file.kind]} — ${file.name}`} loading="lazy" /></a> : error ? <div role="alert">{error}<button className="ad-button" onClick={() => setAttempt(a => a + 1)}>Повторить</button></div> : <div role="status">Загружаем фото…</div>}<figcaption><strong>{fileLabels[file.kind]}</strong><span>Получено {time(file.uploaded_at)}</span><DownloadFile file={file} /></figcaption></figure>;
}
export function Photos({ files }: { files: ServiceFile[] }) {
  const order: Record<string, number> = { before: 0, after: 1, complaint: 2 };
  const sorted = [...files].sort((a, b) => (order[a.kind] - order[b.kind]) || a.uploaded_at.localeCompare(b.uploaded_at));
  return files.length ? <div className="portal-photos">{sorted.map(file => <Photo file={file} key={file.id} />)}</div> : <p className="portal-muted">Фотографии ещё не загружены.</p>;
}
