import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

async function capture(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0,0); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../.impeccable/review/support-${name}.png`, fullPage: true, animations:'disabled' });
}

test('real Groq answer survives reload and stays private across accounts', async ({ page, request, browser }) => {
  test.skip(process.env.TEST_SUPPORT_LIVE !== '1'); test.setTimeout(180000);
  const api = process.env.TEST_API_URL || 'http://127.0.0.1:8000';
  const stamp=Date.now(), password='Support browser test 123';
  const reg=await request.post(`${api}/api/v1/auth/register`,{data:{email:`support-client-${stamp}@example.com`,password,name:'Тестовый клиент',phone:'+77001234567',company:'Проверка поддержки'}});
  expect(reg.status()).toBe(201); const client=await reg.json();
  await page.addInitScript(token=>sessionStorage.setItem('ic-session',token), client.access_token);
  await page.setViewportSize({width:1440,height:1000}); await page.goto('/cabinet/support');
  await expect(page.getByRole('heading',{name:'Чем помочь?'})).toBeVisible(); await capture(page,'empty-desktop');
  await page.getByLabel('Ваш вопрос',{exact:true}).fill('Какова моя роль в кабинете? Могу ли я назначать работников на уборки?');
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(page.locator('.support-answer p')).toContainText(/клиент/i,{timeout:50000});
  const answer=await page.locator('.support-answer p').innerText();
  await page.reload(); await expect(page.locator('.support-answer p')).toHaveText(answer,{timeout:30000});
  await page.getByLabel('Ваш вопрос',{exact:true}).fill('А кто закрывает мою претензию?');
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(page.locator('.support-turn')).toHaveCount(2,{timeout:50000});
  await expect(page.locator('.support-answer p').last()).toContainText(/администратор/i,{timeout:50000});
  await capture(page,'client-desktop'); await page.setViewportSize({width:390,height:844}); await capture(page,'client-mobile');
  const env=Object.fromEntries(readFileSync(path.resolve(import.meta.dirname,'../../backend/.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
  const root=await request.post(`${api}/api/v1/auth/login`,{data:{email:env.SUPERADMIN_EMAIL,password:env.SUPERADMIN_PASSWORD}}); expect(root.status()).toBe(200);
  const token=(await root.json()).access_token;
  const email=`support-worker-${stamp}@example.com`;
  expect((await request.post(`${api}/api/v1/staff/accounts`,{headers:{Authorization:`Bearer ${token}`},data:{role:'worker',email,password,name:'Тестовый работник',phone:'+77001234567',company:'Проверка поддержки'}})).status()).toBe(201);
  const login=await request.post(`${api}/api/v1/auth/login`,{data:{email,password}}); expect(login.status()).toBe(200); const worker=await login.json();
  const ctx=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844}}); const wp=await ctx.newPage();
  await wp.addInitScript(t=>sessionStorage.setItem('ic-session',t),worker.access_token); await wp.goto('/work/support');
  await expect(wp.locator('.support-turn')).toHaveCount(0);
  await wp.getByLabel('Ваш вопрос',{exact:true}).fill('Какая у меня роль? Могу ли я создать аккаунт администратора?');
  await wp.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(wp.locator('.support-answer p')).toContainText(/работник/i,{timeout:50000});
  await capture(wp,'worker-mobile'); await ctx.close();
});

test('provider failure is retryable and answer renders as text',async({page})=>{
  let turn: Record<string,unknown>|null=null;
  await page.addInitScript(()=>sessionStorage.setItem('ic-session','support-test'));
  await page.route('**/api/v1/**',async route=>{
    const url=route.request().url();
    if(url.endsWith('/auth/me')) return route.fulfill({json:{id:'test',role:'manager',name:'Администратор',company:'IC Group'}});
    if(url.includes('/support/messages')) {
      if(route.request().method()==='POST') {
        const data=route.request().postDataJSON();
        turn=turn ? {...turn,status:'completed',answer:'Откройте «Аккаунты сотрудников». <script>alert(1)</script>',error:'',can_retry:false} : {id:'turn',request_key:data.request_key,question:data.message,answer:'',status:'failed',can_retry:true,error:'Помощник временно недоступен.',created_at:new Date().toISOString()};
        return route.fulfill({json:turn});
      }
      return route.fulfill({json:{items:turn?[turn]:[],has_more:false}});
    }
    return route.fulfill({json:[]});
  });
  await page.goto('/admin/support'); await page.getByLabel('Ваш вопрос',{exact:true}).fill('Как создать работника?');
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(page.getByRole('button',{name:'Повторить ответ'})).toBeVisible(); await capture(page,'retry-desktop');
  await page.getByRole('button',{name:'Повторить ответ'}).click();
  await expect(page.locator('.support-turn')).toHaveCount(1);
  await expect(page.locator('.support-answer p')).toContainText('<script>alert(1)</script>');
});
