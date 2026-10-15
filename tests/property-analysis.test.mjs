import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProperty,propertyMap,propertyDefaults,validateProperty,fixedFarmDefaults,fixedFarmCapacity} from '../property-analysis.mjs';
import {selfDefaults,selfScenario} from '../self-sufficiency.mjs';
import {calculate,aggregate} from '../model.mjs';
import {familyMapData} from '../plot.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),clone=x=>structuredClone(x);
const plan=()=>selfScenario(selfDefaults()).plan;
const estate=()=>({...propertyDefaults(),productiveArea:null,maxHomes:null});
function fixed(p){const s=fixedFarmDefaults(p);s.goals.fruit=50;return s;}
test('whole property price and transaction are charged once, retaining unequal agreed shares',()=>{
 const a=plan(),b=plan();a.family.name='A';b.family.name='B';a.assumptions.purchaseFixed=9000000;b.assumptions.purchaseFixed=8000000;
 const e=estate(),x=analyzeProperty([a,b],{landShares:[.7,.3]},e),f=x.finance;
 close(f.propertyCapital,42250000);close(f.fees,2250000);close(f.rows[0].propertyShare,42250000*.7);close(f.rows[1].propertyShare,42250000*.3);
 close(f.totalStartup,f.rows.reduce((s,r)=>s+r.other,0)+42250000);close(f.totalCapex,x.g.rows.reduce((s,r)=>s+r.upfront,0)+42250000);close(f.annualCapitalCost,f.totalCapex*.055);
 const big=analyzeProperty([a,b],{landShares:[.7,.3]},{...e,area:200000});close(big.finance.propertyCapital,f.propertyCapital);
});
test('agreed shared activities and feed correction are retained exactly, not recomputed as independent families',()=>{
 const p=plan(),ps=[p,clone(p)],config={decisions:{goatmilk:{strategy:'shared',quantity:2,minimum:2},hen:{strategy:'shared',quantity:5,minimum:5}}};
 const x=analyzeProperty(ps,config,estate()),g=aggregate(ps,config);
 close(x.required,g.landArea);close(x.finance.monthly,g.monthly);close(x.finance.hours,g.hours);close(x.finance.water,g.water);
 close(x.map.groups.filter(z=>!['unplanned','excluded'].includes(z.id)).reduce((s,z)=>s+z.area,0),g.landArea);assert.ok(x.required<analyzeProperty(ps,{},estate()).required);
});
test('unplanned and excluded land close the whole property and show shortage without squeezing the plan',()=>{
 const p=plan(),base=familyMapData(p,calculate(p)),e={...estate(),excludedArea:300};const m=propertyMap(base,e);
 close(m.groups.reduce((s,g)=>s+g.area,0),e.area);close(m.property.unplanned,e.area-base.area-300);assert.ok(m.groups.some(g=>g.id==='excluded'));
 const small=propertyMap(base,{...e,area:1000});assert.ok(small.property.shortage>0);close(small.area,base.area+300);assert.equal(small.groups.some(g=>g.id==='unplanned'),false);
});
test('unused capital is a diagnostic fraction of the full price, never an additional expense',()=>{
 const e=estate(),x=analyzeProperty([plan()],{},e);close(x.unusedValue,e.price*x.unplanned/e.area);close(x.unusedAnnual,x.unusedValue*.055);close(x.finance.propertyCapital,e.price*1.05+250000);
});
test('whole group repetition respects homes and productive area; fractional groups create no extra families',()=>{
 const ps=[plan(),plan()],base=analyzeProperty(ps,{},estate()),required=base.required,e={...estate(),area:required*3.8,maxHomes:5};
 const x=analyzeProperty(ps,{},e);assert.equal(x.repeat.areaCopies,3);assert.equal(x.repeat.copies,2);assert.equal(x.repeat.totalFamilies,4);assert.equal(x.repeat.additionalFamilies,2);
 close(x.maxCopyFinance.propertyCapital,x.finance.propertyCapital);close(x.maxCopyFinance.totalStartup,x.finance.rows.reduce((s,r)=>s+r.other,0)*2+x.finance.propertyCapital);
 const y=analyzeProperty(ps,{}, {...e,productiveArea:base.productive*.5});assert.equal(y.repeat.copies,0);assert.equal(y.limits.productive,false);
});
test('largest family comparison selects standalone land need, independently from shared group allocation',()=>{
 const a=plan(),b=selfScenario(selfDefaults(),'grain').plan;a.family.name='Small';b.family.name='Large';const x=analyzeProperty([a,b],{},estate());
 assert.equal(x.largest.index,1);assert.equal(x.largest.name,'Large');close(x.largest.area,calculate(b).landArea);assert.equal(x.largest.capacity.totalFamilies,Math.floor(estate().area/x.largest.area));
});
test('unknown price and constraints remain unknown instead of free or verified capacity',()=>{
 const x=analyzeProperty([plan()],{},{...estate(),price:null});assert.equal(x.finance.propertyCapital,null);assert.equal(x.finance.totalStartup,null);assert.equal(x.limits.budget,null);assert.equal(x.unusedValue,null);assert.equal(x.repeat.conditional,true);assert.equal(x.limits.homes,null);
});
test('cash is not redistributed; estate upkeep enters monthly costs and reserves once',()=>{
 const a=plan(),b=plan();a.family.budget=1;b.family.budget=1e9;const e=estate(),x=analyzeProperty([a,b],{},e),y=analyzeProperty([a,b],{},{...e,annualUpkeep:120000});
 assert.equal(x.limits.budget,false);assert.ok(x.finance.totalBudget>x.finance.totalStartup);assert.ok(x.finance.rows[0].gap>0);
 close(y.finance.monthly-x.finance.monthly,10000);close(y.finance.totalStartup-x.finance.totalStartup,10000*calculate(a).reserveMonths);close(y.finance.totalCapex,x.finance.totalCapex);
});
test('external help is paid in existing group monthly costs and explicitly covers average labour only',()=>{
 const p=plan();p.family.availableHours=0;const a=analyzeProperty([p],{},estate()),b=analyzeProperty([p],{externalHelp:true},estate());assert.equal(a.limits.work,false);assert.equal(b.limits.work,true);assert.equal(b.limits.peak,false);assert.ok(b.finance.monthly>a.finance.monthly);
});
test('fixed stock food capacity is the narrowest positive target, not milk surplus alone',()=>{
 const p=plan(),s=fixed(p),x=fixedFarmCapacity(p,s,estate());assert.equal(x.foodCapacity,1);assert.equal(x.foods.find(f=>f.product==='milk').capacity,3);assert.equal(x.best.n,1);
 const many={...s,quantities:Object.fromEntries(Object.entries(s.quantities).map(([id,q])=>[id,q*3]))};const y=fixedFarmCapacity(p,many,{...estate(),area:50000});assert.equal(y.foodCapacity,3);assert.equal(y.best.n,3);
});
test('fixed stock and feed do not multiply with number of families; houses, living costs and water do',()=>{
 const p=plan(),x=fixedFarmCapacity(p,fixed(p),estate()),one=x.rows[0],two=x.rows[1];
 for(const r of one.result.rows)close(two.result.rows.find(q=>q.id===r.id).qty,r.qty);
 close(two.result.feedLand.extra,one.result.feedLand.extra);close(two.result.homeLand,one.result.homeLand*2);close(two.result.siteLand,one.result.siteLand*2);close(two.hours,one.hours);
 assert.ok(two.water>one.water);close(two.propertyPerFamily,one.propertyPerFamily/2);close(two.totalCapex,two.result.upfront+42250000);close(two.annualCapitalCost,two.totalCapex*.055);
});
test('zero food targets produce no recommendation; money, work, land and homes constrain fixed stock',()=>{
 const p=plan(),s=fixed(p);s.goals=Object.fromEntries(Object.keys(s.goals).map(k=>[k,0]));const zero=fixedFarmCapacity(p,s,estate());assert.equal(zero.foodCapacity,null);assert.equal(zero.best,null);
 for(const patch of [{maxHomes:0},{area:100,productiveArea:null}])assert.equal(fixedFarmCapacity(p,fixed(p),{...estate(),...patch}).best,null);
 p.family.budget=1;assert.equal(fixedFarmCapacity(p,fixed(p),estate()).best,null);p.family.budget=1e9;p.family.availableHours=0;assert.equal(fixedFarmCapacity(p,fixed(p),estate()).best,null);
});
test('analysis leaves saved families, shared decisions, fixed quantities and property inputs unchanged',()=>{
 const p=plan(),e=estate(),s=fixed(p),config={landShares:[1]},before=JSON.stringify({p,e,s,config});analyzeProperty([p],config,e);fixedFarmCapacity(p,s,e);assert.equal(JSON.stringify({p,e,s,config}),before);
});
test('invalid values cannot generate property recommendations',()=>{
 for(const patch of [{area:0},{price:0},{price:-1},{excludedArea:20000},{productiveArea:20000},{maxHomes:.5},{purchasePct:101},{rate:NaN}])assert.throws(()=>validateProperty({...estate(),...patch}));
 const p=plan(),s=fixed(p);assert.throws(()=>fixedFarmCapacity(p,{...s,feedShare:101},estate()));assert.throws(()=>fixedFarmCapacity(p,{...s,quantities:{...s.quantities,hen:.5}},estate()));assert.throws(()=>analyzeProperty([],{},estate()));
});
