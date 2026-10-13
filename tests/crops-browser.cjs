const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.GYOKER_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const {defaultPlan,NEW_CROP_IDS}=await import('../data.mjs');
 const {calculate,validatePlan}=await import('../model.mjs');
 const legacy=defaultPlan();legacy.family.name='Korábbi növényterv';legacy.catalogue=legacy.catalogue.filter(c=>!NEW_CROP_IDS.includes(c.id));legacy.catalogue[0].name='Konyhakert';legacy.catalogue[0].setup=123;delete legacy.catalogue[0].note;delete legacy.food.profileVersion;for(const id of ['potatoes','sweetcorn'])delete legacy.food.consumption[id];for(const id of ['potato','sweetcorn','maize','apricot'])delete legacy.food.production[id];legacy.food.consumption.vegetables={mode:'manual',annualPerPerson:90,annualHousehold:177};
 const originalFamily=JSON.stringify(legacy),originalGroup=JSON.stringify({families:[{plan:legacy}],config:{}}),expected=calculate(legacy);
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'gyoker-crops-'));
 const browser=await chromium.launch({executablePath:process.env.GYOKER_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(({originalFamily,originalGroup})=>{localStorage.setItem('gyoker-family-v2',originalFamily);localStorage.setItem('gyoker-group-v2',originalGroup);},{originalFamily,originalGroup});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.GYOKER_BASE_URL||'http://127.0.0.1:8000');
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('gyoker-family-v5'))),actual=calculate(validatePlan(restored));assert.equal(actual.landArea,expected.landArea);assert.equal(actual.monthly,expected.monthly);assert.equal(restored.catalogue[0].setup,123);assert.equal(restored.food.consumption.vegetables.annualHousehold,177);assert.equal(restored.items.length,3);
 assert.ok((await page.locator('.activity-name').first().innerText()).includes('háztáji zöldséges'));
 for(const id of NEW_CROP_IDS)assert.equal(await page.locator(`#new-activity option[value="${id}"]`).count(),1);
 for(const [offset,id] of NEW_CROP_IDS.entries()){
  await page.locator('#new-activity').selectOption(id);await page.locator('#add-activity').click();
  if(id==='feedmaize'){assert.equal(await page.locator('[data-path="items.6.quantityMode"]').count(),0);continue;}
  await page.locator(`[data-path="items.${offset+3}.quantityMode"]`).selectOption('self');assert.ok((await page.locator(`[data-self-result="${id}"]`).innerText()).includes('Várható felhasználható termelés'));
 }
 assert.ok((await page.locator('[data-self-result="apricot"]').innerText()).includes('6 fa'));
 const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('gyoker-family-v5')));const r=calculate(validatePlan(current));assert.ok(r.rows.find(x=>x.id==='feedmaize').feedProduced>0);assert.ok(!r.rows.find(x=>x.id==='maize').feedProduced);assert.ok(!r.rows.find(x=>x.id==='sweetcorn').feedProduced);
 await page.locator('.food-profile>summary').click();await page.locator('[data-path="food.consumption.potatoes.mode"]').selectOption('manual');await page.locator('[data-path="food.consumption.potatoes.annualHousehold"]').fill('120');assert.ok((await page.locator('[data-self-result="potato"]').innerText()).includes('28,24 m²'));
 let wait=page.waitForEvent('download');await page.locator('#save-family').click();let dl=await wait;const file=path.join(output,'new-crops.json');await dl.saveAs(file);const exported=JSON.parse(fs.readFileSync(file));assert.ok(NEW_CROP_IDS.every(id=>exported.plan.items.some(i=>i.id===id)));assert.equal(exported.plan.food.profileVersion,2);
 await page.reload();assert.equal(await page.locator('[data-path="items.3.quantityMode"]').inputValue(),'self');assert.ok((await page.locator('[data-self-result="potato"]').innerText()).includes('28,24 m²'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('gyoker-family-v2')),originalFamily);assert.equal(await page.evaluate(()=>localStorage.getItem('gyoker-group-v2')),originalGroup);
 await page.getByRole('button',{name:'Reveal party'}).click();await page.locator('#add-current').click();assert.equal(await page.locator('.family-chip').count(),2);const inventory=await page.locator('#group-content .inventory-grid').innerText();for(const text of ['Burgonya','Csemegekukorica','Szemes kukorica, étkezési','Szemes kukorica, takarmányra','Kajszibarackfa'])assert.ok(inventory.includes(text));
 await page.getByRole('button',{name:'Családi terv',exact:true}).click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.getByRole('link',{name:'Újdonságok',exact:true}).click();await page.locator('#crops').waitFor();assert.equal(await page.locator('.release-entry').count(),9);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:path.join(output,'new-crops-release-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: previous v2 saved family/community migration, unchanged legacy results, all new choices and food goals, feed separation, potato consumption override, JSON export/reload, group inventory, mobile and release notes');console.log('Artifacts:',output);
})().catch(e=>{console.error(e);process.exit(1)});
