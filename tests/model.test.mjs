import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPlan} from '../data.mjs';
import {calculate,validatePlan,aggregate,weightsFromPoint,pointFromWeights,VERTICES} from '../model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
function blank(budget=10000000) {
  const p=defaultPlan();p.family.budget=budget;p.family.livingMonthly=0;p.home={min:0,wish:0,locked:false,level:'economy',ownWorkPct:0};p.reserve={min:0,wish:0,locked:false};p.items=[];
  for(const k of Object.keys(p.site))if(typeof p.site[k]==='number')p.site[k]=0;
  for(const service of Object.values(p.serviceCatalogue))for(const o of Object.values(service.options)){o.setup=0;o.monthly=0;}
  for(const k of ['heatingMonthly','designPct','contingencyPct','purchasePct','purchaseFixed'])p.assumptions[k]=0;
  return p;
}
const separate={'service-water':{strategy:'separate'},'service-power':{strategy:'separate'},'service-waste':{strategy:'separate'},'site-fence':{strategy:'separate'}};

test('default plan is valid; accounting includes closing costs and reserves',()=>{
  const p=validatePlan(defaultPlan());p.family.budget=200000000;
  const r=calculate(p);
  close(r.upfront+r.contingency+r.reserve+r.landBudget*(1+p.assumptions.purchasePct/100)+p.assumptions.purchaseFixed,p.family.budget);
  close(r.breakdown.reduce((s,x)=>s+x.value,0),p.family.budget);
  assert.ok(Object.values(p.sources).every(s=>s.url.startsWith('https://')));
});
test('locked values survive all triangle endpoints and the minimum scenario',()=>{
  const p=defaultPlan();p.home.locked=true;p.items[1].locked=true;p.reserve.locked=true;
  for(const w of [[1,0,0],[0,1,0],[0,0,1]]){p.preferences.balance=w;const r=calculate(p);close(r.homeArea,p.home.wish);assert.equal(r.rows[1].qty,p.items[1].wish);close(r.reserveMonths,p.reserve.wish);}
  assert.equal(calculate(p,{minimum:true}).rows[1].qty,10);
});
test('animals are whole; growing area can be fractional; no fractional household animals',()=>{
  const r=calculate(defaultPlan());assert.equal(r.rows.find(x=>x.id==='hen').qty,8);assert.equal(r.rows.find(x=>x.id==='apple').qty,8);assert.ok(r.rows.find(x=>x.id==='garden').qty>166);
});
test('existing feed crops are credited once, in the appropriate feed category',()=>{
  const p=blank();p.assumptions.feedShare=100;p.assumptions.grainYield=.5;
  p.catalogue.find(c=>c.id==='hen').feed=1;p.catalogue.find(c=>c.id==='feedgrain').feedYield=.5;
  p.items=[{id:'hen',min:2,wish:2,locked:true,scope:'family',owned:false}];
  const before=calculate(p);close(before.autoFeedByKind.grain.extra,1460);
  p.items.push({id:'feedgrain',min:1460,wish:1460,locked:true,scope:'family',owned:false});
  const after=calculate(p);close(after.autoFeedByKind.grain.extra,0);close(after.landArea,before.landArea);
  p.items[1].id='forage';assert.ok(calculate(p).autoFeedByKind.grain.extra>0,'forage does not replace poultry grain');
});
test('resource triangle uses only authorized changes',()=>{
  const p=defaultPlan();p.preferences.resources=[1,0,0];const a=calculate(p);p.preferences.resources=[0,0,1];const b=calculate(p);close(a.landArea,b.landArea);close(a.upfront,b.upfront);
  p.preferences.feedFlexible=true;const c=calculate(p);assert.ok(c.landArea>b.landArea);assert.equal(c.feedShare,1);
  p.preferences.irrigation=true;p.preferences.machinery=true;p.preferences.resources=[0,1,0];const d=calculate(p);assert.ok(d.hours<b.hours);assert.ok(d.upfront>b.upfront);
});
test('földkeret mode holds the desired reserve and reduces other desires at its corner',()=>{
  const p=defaultPlan();p.preferences.budgetMode='landBudget';p.preferences.landBudget=[0,0,1];const r=calculate(p);close(r.homeArea,p.home.min);close(r.reserveMonths,p.reserve.wish);assert.equal(r.rows[1].qty,p.items[1].min);
});
test('equal purchase shares are limited by the weakest individual budget, not pooled cash',()=>{
  const g=aggregate([blank(10000000),blank(20000000),blank(30000000)],{decisions:separate});close(g.landBudgetLimit,30000000);close(g.pool,60000000);assert.equal(g.maximumArea,null);
  const quoted=aggregate([blank(10000000),blank(20000000),blank(30000000)],{decisions:separate,landPrice:1000});close(quoted.maximumArea,30000);
});
test('shared flags do not silently deduplicate; explicit shared decision deduplicates once',()=>{
  const p=blank();p.assumptions.feedShare=0;p.items=[{id:'hen',min:3,wish:3,locked:true,scope:'shared',owned:false}];
  const q=structuredClone(p);q.items[0].scope='family';
  const preliminary=aggregate([p,q],{decisions:separate});assert.equal(preliminary.unresolved,1);close(preliminary.landArea,6*1.02);
  const g=aggregate([p,q],{decisions:{...separate,hen:{strategy:'shared',minimum:3,quantity:3}}});assert.equal(g.unresolved,0);close(g.landArea,3*1.02);assert.equal(g.quantities.find(x=>x.id==='hen').qty,3);close(g.rows.reduce((s,x)=>s+x.upfront,0),3*22000);
});
test('a merged feed field is credited once against all family animals',()=>{
  const p=blank();p.assumptions.feedShare=100;p.assumptions.grainYield=.5;
  p.catalogue.find(x=>x.id==='hen').feed=1;p.catalogue.find(x=>x.id==='feedgrain').feedYield=.5;
  p.items=[{id:'hen',min:2,wish:2,locked:true,scope:'family',owned:false},{id:'feedgrain',min:100,wish:100,locked:true,scope:'shared',owned:false}];
  const g=aggregate([p,p],{decisions:{...separate,feedgrain:{strategy:'shared',minimum:100,quantity:100}}});
  close(g.landArea,4*1.02+4*365/.5);close(g.minimumArea,g.landArea);
});
test('tools and an outbuilding can be shared, including their footprint',()=>{
  const p=blank();p.site.tools=1000;p.site.toolsScope='shared';p.site.outbuildings=5000;p.site.outbuildingsScope='shared';p.site.storage=40;
  const g=aggregate([p,p],{decisions:{...separate,'equipment-tools':{strategy:'shared',minimum:1,quantity:1},'site-outbuildings':{strategy:'shared',minimum:1,quantity:1}}});
  close(g.rows.reduce((s,r)=>s+r.upfront,0),6000);close(g.landArea,40);
});
test('a shared activity proposed by one family still needs community agreement',()=>{
  const p=blank();p.assumptions.feedShare=0;p.items=[{id:'hen',min:4,wish:4,locked:true,scope:'shared',owned:false}];const q=blank();
  const draft=aggregate([p,q],{decisions:separate});assert.ok(draft.conflicts.some(c=>c.id==='hen'));assert.equal(draft.unresolved,1);
  const agreed=aggregate([p,q],{decisions:{...separate,hen:{strategy:'shared',minimum:4,quantity:4}}});close(agreed.rows[0].upfront,44000);close(agreed.rows[1].upfront,44000);assert.equal(agreed.quantities.find(x=>x.id==='hen').qty,4);
});
test('internal work compensation sums to zero and does not pay for unfilled hours',()=>{
  const p=blank();p.assumptions.feedShare=0;p.catalogue.find(c=>c.id==='hen').hours=10;p.items=[{id:'hen',min:3,wish:3,locked:true,scope:'shared',owned:false}];
  const opts={decisions:{...separate,hen:{strategy:'shared',minimum:3,quantity:3}},hourlyRate:3000,workHours:[5,25]};
  const g=aggregate([p,p],opts);close(g.sharedHours,30);close(g.sharedShortage,0);close(g.rows[0].transfer,30000);close(g.rows[1].transfer,-30000);close(g.rows.reduce((s,x)=>s+x.transfer,0),0);
  const short=aggregate([p,p],{...opts,workHours:[0,10]});close(short.sharedShortage,20);close(short.rows[0].transfer,15000);assert.ok(short.rows.every(x=>x.reserve>=0));
  const external=aggregate([p,p],{...opts,workHours:[0,10],externalHelp:true,externalRate:5000});close(external.rows.reduce((s,x)=>s+x.external,0),100000);
});
test('invalid imports, unsafe links, impossible weights, and fractional animals are rejected',()=>{
  for(const mutate of [p=>p.family.budget=-1,p=>p.items[1].wish=1.5,p=>p.home.min=500,p=>p.preferences.balance=[1,1,1],p=>p.sources['catalogue.hen.feed'].url='javascript:alert(1)',p=>p.serviceCatalogue.water.options.fake={setup:0,monthly:0,name:'fake'}]){const p=defaultPlan();mutate(p);assert.throws(()=>validatePlan(p));}
});
test('invalid group decisions and overallocated work/shares are rejected',()=>{
  assert.throws(()=>aggregate([blank(),blank()],{landShares:[.6,.6]}));
  assert.throws(()=>aggregate([blank(),blank()],{workHours:[1,0]}));
  assert.throws(()=>aggregate([blank(),blank()],{hourlyRate:-1}));
  assert.throws(()=>aggregate([blank(),blank()],{decisions:{'service-water':{strategy:'shared',quantity:.5,minimum:0}}}));
});
test('triangle projection stays inside, preserves vertices and round-trips',()=>{
  VERTICES.forEach((v,i)=>weightsFromPoint(...v).forEach((w,j)=>close(w,i===j?1:0)));
  for(const point of [[-500,-100],[1000,900],[0,0],[160,200]]){const w=weightsFromPoint(...point);assert.ok(w.every(x=>x>=0&&x<=1));close(w.reduce((a,b)=>a+b),1);}
  const w=[.2,.3,.5];weightsFromPoint(...pointFromWeights(w)).forEach((value,i)=>close(value,w[i]));
});
