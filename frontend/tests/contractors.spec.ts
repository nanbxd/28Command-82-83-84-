import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const api = process.env.TEST_API_URL || 'http://127.0.0.1:8000';
const password = 'Contractor browser test 123';
const photo = { name: 'zone.JPG', mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDp6KKK+LOEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==', 'base64') };
async function capture(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const dialog = page.getByRole('dialog'); if (await dialog.count()) await dialog.evaluate(e => e.scrollTo(0,0));
  await page.locator('.portal-photo img').evaluateAll(imgs => imgs.forEach(img => (img as HTMLImageElement).loading = 'eager'));
  await expect.poll(() => page.locator('.portal-photo img').evaluateAll(imgs => imgs.every(img => { (img as HTMLImageElement).loading = 'eager'; return (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0; }))).toBeTruthy();
  await page.screenshot({path:`../.impeccable/review/contractor-${name}.png`, fullPage: !(await dialog.count()), animations:'disabled'});
}
test('admin assigns contractor, contractor schedules zones, workers report, client sees complete cleaning', async ({page,request,browser}) => {
  test.setTimeout(240000); test.skip(process.env.TEST_OPERATIONS !== '1');
  const env = Object.fromEntries(readFileSync(path.resolve(import.meta.dirname,'../../backend/.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
  const login = async (email:string, secret=password) => { const r=await request.post(`${api}/api/v1/auth/login`,{data:{email,password:secret}}); expect(r.status()).toBe(200); return r.json(); };
  const root=await login(env.SUPERADMIN_EMAIL,env.SUPERADMIN_PASSWORD); const stamp=Date.now();
  const header=(token:string)=>({Authorization:`Bearer ${token}`});
  const data=(role:string,email:string,name:string)=>({role,email,name,password,phone:'+77001234567',company:'Проверка кабинетов исполнителей'});
  const adminEmail=`crew-admin-${stamp}@example.com`, contractorEmail=`crew-contractor-${stamp}@example.com`;
  expect((await request.post(`${api}/api/v1/staff/accounts`,{headers:header(root.access_token),data:data('manager',adminEmail,'Администратор проверки')})).status()).toBe(201);
  const admin=await login(adminEmail);
  await page.addInitScript(t=>sessionStorage.setItem('ic-session',t),admin.access_token); await page.setViewportSize({width:1440,height:1000}); await page.goto('/admin/accounts');
  async function accountForm(who:Page,email:string,name:string,role?:string) {
    await who.getByRole('button',{name:'Создать аккаунт',exact:true}).click(); const d=who.getByRole('dialog');
    if (role) await d.getByLabel('Роль',{exact:true}).selectOption(role);
    await d.getByLabel('Имя',{exact:true}).fill(name); await d.getByLabel('Email',{exact:true}).fill(email); await d.getByLabel('Телефон',{exact:true}).fill('+77001234567'); await d.getByLabel('Пароль · минимум 12 символов').fill(password);
    await d.getByRole('button',{name:'Создать аккаунт',exact:true}).click(); await expect(d).not.toBeVisible();
  }
  await accountForm(page,contractorEmail,'Субподрядчик проверки');
  const contractor=await login(contractorEmail);
  const cctx=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:1440,height:1000}}); const c=await cctx.newPage(); await c.addInitScript(t=>sessionStorage.setItem('ic-session',t),contractor.access_token); await c.goto('/contractor/accounts');
  const workers=[];
  for(let i=1;i<=2;i++){ const email=`crew-worker${i}-${stamp}@example.com`; await accountForm(i === 1 ? page : c,email,`Работник ${i}`, 'worker'); workers.push(await login(email)); }
  await capture(c,'team-desktop'); await c.setViewportSize({width:390,height:844}); await capture(c,'team-mobile'); await c.setViewportSize({width:1440,height:1000});
  const reg=await request.post(`${api}/api/v1/auth/register`,{data:{...data('client',`crew-client-${stamp}@example.com`,'Клиент проверки'),role:undefined}}); expect(reg.status()).toBe(201); const customer=await reg.json();
  const schedule={days:[1,3,5],start_time:'08:00',duration_hours:2};
  const submitted=await request.post(`${api}/api/v1/requests`,{headers:header(customer.access_token),data:{idempotency_key:`crew-test-${stamp}`,details:{objects:[{object_type:'office',segment:'Офисы',name:'Офис проверки зон',city:'Алматы',address:'Тестовый адрес, 10',area_sqm:350,base_schedule:schedule,support_positions:[],bathrooms:2,hygiene_materials:true,general_cleaning:'monthly',notes:'Проверка кабинетов'}],monthly_budget:null,desired_start:null}}}); expect(submitted.status()).toBe(201);
  const source=await submitted.json(); const converted=await request.post(`${api}/api/v1/staff/requests/${source.id}/projects`,{headers:header(admin.access_token)}); const project=(await converted.json())[0];
  await page.goto(`/admin/projects/${project.id}`); await expect(page.getByRole('button', {name:'Назначить уборку',exact:true})).toHaveCount(0); await page.getByRole('button',{name:'Закрепить субподрядчика'}).click(); await page.getByRole('dialog').getByLabel('Субподрядчик',{exact:true}).selectOption(contractor.user.id); await page.getByRole('button',{name:'Сохранить назначение'}).click(); await expect(page.getByRole('dialog')).not.toBeVisible(); await capture(page,'assignment-desktop');
  await c.goto(`/contractor/projects/${project.id}`); await c.getByRole('button',{name:'Запланировать клининг'}).click(); const plan=c.getByRole('dialog'); await plan.getByLabel('Название уборки').fill('Утренняя уборка');
  await plan.getByRole('button',{name:'Добавить зону'}).click();
  for(let i=0;i<2;i++){ const group=plan.getByRole('group',{name:`Задание ${i+1}`}); await group.getByLabel('Зона',{exact:true}).fill(i?'Уборная второго этажа':'Первый этаж'); await group.getByLabel('Начало',{exact:true}).fill('2026-11-01T09:00'); await group.getByLabel('Окончание',{exact:true}).fill('2026-11-01T11:00'); await group.getByLabel('Работник',{exact:true}).selectOption(workers[i].user.id); await group.getByLabel('Обязанности').fill('Вымыть пол'); }
  await capture(c,'plan-desktop'); await c.setViewportSize({width:390,height:844}); await capture(c,'plan-mobile'); await c.setViewportSize({width:1440,height:1000}); await plan.getByRole('button',{name:'Отправить приглашения'}).click(); await expect(plan).not.toBeVisible();
  await expect(c.getByRole('button',{name:'Подтвердить завершение клининга'})).toBeDisabled(); await capture(c,'schedule-desktop');
  await page.getByRole('button',{name:'Заблокировать объект',exact:true}).click();
  await expect(page.getByRole('button',{name:'Разблокировать объект',exact:true})).toBeVisible();
  await c.reload(); await expect(c.getByRole('button',{name:'Запланировать клининг'})).toBeDisabled();
  await capture(page,'blocked-admin-desktop'); await c.setViewportSize({width:390,height:844}); await capture(c,'blocked-contractor-mobile'); await c.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Разблокировать объект',exact:true}).click();
  await expect(page.getByRole('button',{name:'Заблокировать объект',exact:true})).toBeVisible();
  const base64 = await c.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 3000; canvas.height = 2200;
    const ctx = canvas.getContext('2d')!; const pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 12345;
    for (let i=0;i<pixels.data.length;i+=4) { for(let j=0;j<3;j++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels.data[i+j] = seed & 255; } pixels.data[i+3]=255; }
    ctx.putImageData(pixels,0,0); return canvas.toDataURL('image/jpeg',0.92).split(',')[1];
  });
  const largePhoto = { name:'camera-5mb.jpg', mimeType:'image/jpeg', buffer:Buffer.from(base64,'base64') };
  expect(largePhoto.buffer.length).toBeGreaterThan(5_000_000); expect(largePhoto.buffer.length).toBeLessThan(8*1024*1024);
  for(let i=0;i<2;i++){ const ctx=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844}}); const w=await ctx.newPage(); await w.addInitScript(t => { sessionStorage.setItem('ic-session', t); const original = window.fetch; window.fetch = (input, options) => { if(options?.body instanceof Blob && String(input).includes('/files?')) Object.assign(window, { __uploadBytes: options.body.size }); return original(input, options); }; }, workers[i].access_token); await w.goto(`/work/projects/${project.id}`);
    await expect(w.getByRole('button',{name:'Начать уборку',exact:true})).toHaveCount(0);
    await w.goto('/work/invitations');
    if(i===0) { await capture(w,'invitations-mobile'); await w.setViewportSize({width:1440,height:1000}); await capture(w,'invitations-desktop'); await w.setViewportSize({width:390,height:844}); }
    await w.getByRole('button',{name:'Принять смену',exact:true}).click(); await expect(w.getByText('Новых приглашений нет',{exact:true})).toBeVisible();
    await w.goto(`/work/projects/${project.id}`);
    const upload=async (label:RegExp)=>{const input=w.getByLabel(label); await input.setInputFiles(i === 0 ? largePhoto : photo); const form=input.locator('xpath=ancestor::form'); const transfer = w.waitForRequest(r => r.method() === 'POST' && r.url().includes('/files?')); const started = Date.now(); await form.getByRole('button',{name:'Загрузить файл'}).click(); await transfer; await expect(form.getByRole('status')).toContainText('Файл сохранён.'); if(i===0) { const bytes = await w.evaluate(() => (window as Window & { __uploadBytes: number }).__uploadBytes); expect(bytes).toBeGreaterThan(0); expect(bytes).toBeLessThan(largePhoto.buffer.length / 2); console.log(JSON.stringify({originalBytes:largePhoto.buffer.length,uploadedBytes:bytes,elapsedMs:Date.now()-started})); }};
    await expect(w.getByRole('button',{name:'Начать уборку',exact:true})).toBeDisabled(); await upload(/^До уборки ·/); await w.getByRole('button',{name:'Начать уборку',exact:true}).click(); await expect(w.getByRole('button',{name:'Завершить и отправить отчёт'})).toBeDisabled(); await w.getByLabel('Вымыть пол',{exact:true}).check(); await upload(/^После уборки ·/); if(i===0) await capture(w,'worker-mobile'); await w.getByRole('button',{name:'Завершить и отправить отчёт'}).click(); await expect(w.getByText('Отчёт на проверке',{exact:true})).toBeVisible(); await ctx.close();
    await c.reload(); if(i===0) await expect(c.getByRole('button',{name:'Подтвердить завершение клининга'})).toBeDisabled();
  }
  await c.getByRole('button',{name:'Подтвердить завершение клининга'}).click(); await expect(c.getByText(/Клининг полностью проведён/)).toBeVisible(); await capture(c,'completed-desktop'); await c.setViewportSize({width:390,height:844}); await capture(c,'completed-mobile');
  const clientCtx=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:1440,height:1000}}); const cp=await clientCtx.newPage(); await cp.addInitScript(t=>sessionStorage.setItem('ic-session',t),customer.access_token); await cp.goto(`/cabinet/projects/${project.id}`); await expect(cp.getByText(/Клининг полностью проведён/)).toBeVisible(); await expect(cp.locator('.portal-photo img')).toHaveCount(4); await capture(cp,'client-desktop'); await cp.setViewportSize({width:390,height:844}); await capture(cp,'client-mobile');
  await clientCtx.close(); await cctx.close();
});
