import {defaultPlan} from './data.mjs?v=20261013-8';
import {calculate} from './model.mjs?v=20261013-8';
import {FOOD_PRODUCTS} from './food.mjs?v=20261013-8';
import {MNB_BENCHMARK} from './feed-economics.mjs?v=20261013-8';
export const SELF_SCENARIOS=[{id:'basic',name:'Kert, gyümölcs, tojás, tej'},{id:'meat',name:'Az előzők + hús'},{id:'grain',name:'Az előzők + étkezési gabona'}];
export const PROFILE_FIELDS={vegetables:['Zöldség saját célja','%',0,100],fruit:['Gyümölcs saját célja','%',0,100],eggs:['Tojás saját célja','%',0,100],milk:['Ivótej saját célja','%',0,100],meat:['Hús saját célja · 2. és 3. változat','%',0,100],grain:['Gabona saját célja · 3. változat','%',0,100],feedShare:['Állatok saját takarmánya','%',0,100],homeArea:['Hasznos lakóterület családonként','m²',1,500],goatMin:['Választott minimális kecskeállomány','állat',1,20],yieldFactor:['Termelő- és takarmányhozam szorzója','× alaphozam',.1,3],budget:['Teljes induló keret családonként','Ft',1,1e10],availableHours:['Vállalható gazdasági munka családonként','óra/hó',0,2000],livingMonthly:['Megélhetési keret családonként','Ft/hó',0,1e8],reserveMonths:['Működési tartalék','hónap',0,36],rate:['Választott tőkeráta · alap MNB','%/év',0,100]};
export function selfDefaults(){return {vegetables:100,fruit:50,eggs:100,milk:100,meat:100,grain:80,feedShare:50,homeArea:100,goatMin:2,yieldFactor:1,budget:150000000,availableHours:100,livingMonthly:300000,reserveMonths:6,rate:MNB_BENCHMARK.rate};}
function validProfile(p){for(const [key,[,,min,max]] of Object.entries(PROFILE_FIELDS))if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error('Hibás önellátási feltételezés: '+key);if(!Number.isInteger(p.goatMin))throw new Error('A kecskeszám egész legyen.');}
function validCounts(counts){if(!Array.isArray(counts)||counts.length!==3||counts.some(n=>!Number.isInteger(n)||n<0)||counts.reduce((s,n)=>s+n,0)<1||counts.reduce((s,n)=>s+n,0)>24)throw new Error('1–24 család, három egész forgatókönyv-mennyiséggel szükséges.');}
const total=(xs,f)=>xs.reduce((s,x)=>s+f(x),0);
const PRODUCERS={vegetables:'garden',fruit:'apple',eggs:'hen',milk:'goatmilk',meat:'pig',grain:'wheat'};
function sharedPlan(profile,counts){
 validProfile(profile);validCounts(counts);const n=total(counts,x=>x),p=defaultPlan();
 p.family={...p.family,name:'2 felnőtt + 2 gyerek / család',adults:2*n,children:2*n,budget:n*profile.budget,availableHours:n*profile.availableHours,livingMonthly:n*profile.livingMonthly};
 p.home={min:n*profile.homeArea,wish:n*profile.homeArea,locked:true,level:'standard',ownWorkPct:0};
 p.reserve={min:profile.reserveMonths,wish:profile.reserveMonths,locked:true};p.assumptions.feedShare=profile.feedShare;p.assumptions.heatingMonthly*=n;
 p.assumptions.grainYield*=profile.yieldFactor;p.assumptions.forageYield*=profile.yieldFactor;
 for(const c of p.catalogue)if(c.feedYield)c.feedYield*=profile.yieldFactor;
 for(const c of Object.values(p.food.production))c.annualYield*=profile.yieldFactor;
 for(const key of Object.keys(p.site))if(typeof p.site[key]==='number')p.site[key]*=n;
 for(const service of Object.values(p.serviceCatalogue))for(const option of Object.values(service.options)){option.setup*=n;option.monthly*=n;}
 p.preferences.feedFlexible=false;p.preferences.irrigation=false;p.preferences.machinery=false;
 const targets=Object.fromEntries(Object.keys(PRODUCERS).map(product=>{const relevant=product==='meat'?counts[1]+counts[2]:product==='grain'?counts[2]:n;return [product,4*relevant*FOOD_PRODUCTS[product].annualPerPerson*profile[product]/100];}));
 p.items=[];
 for(const [product,id] of Object.entries(PRODUCERS)){
  const c=p.catalogue.find(c=>c.id===id),food=p.food.production[id],raw=targets[product]/(food.annualYield*food.usablePct/100);
  let qty=c.unit==='m²'?raw:Math.ceil(raw-1e-9);if(id==='goatmilk'&&qty>0)qty=Math.max(profile.goatMin,qty);
  if(qty>0)p.items.push({id,min:qty,wish:qty,locked:true,scope:'shared',owned:false,quantityMode:'manual'});
 }
 return {plan:p,targets};
}
export function selfScenario(profile,id='basic',families=1){const index=SELF_SCENARIOS.findIndex(x=>x.id===id);if(index<0)throw new Error('Ismeretlen forgatókönyv.');const counts=[0,0,0];counts[index]=families;return selfMix(profile,counts);}
export function selfMix(profile,counts,{shared=true}={}){
 validCounts(counts);validProfile(profile);const n=total(counts,x=>x);
 if(!shared&&n>1){const parts=counts.flatMap((qty,i)=>Array.from({length:qty},()=>selfScenario(profile,SELF_SCENARIOS[i].id)));return combine(parts,counts);}
 const {plan,targets}=sharedPlan(profile,counts),r=calculate(plan),baseCrops=r.rows.filter(x=>['garden','apple','wheat'].includes(x.id));
 const productiveArea=total(baseCrops,x=>x.area)+r.feedLand.extra;
 const foods=Object.entries(PRODUCERS).map(([product,id])=>{const row=r.rows.find(x=>x.id===id),production=row?.food?.production||0;return {product,name:FOOD_PRODUCTS[product].name,unit:FOOD_PRODUCTS[product].unit,demand:n*4*FOOD_PRODUCTS[product].annualPerPerson,target:targets[product],production,surplus:Math.max(0,production-targets[product]),qty:row?.qty||0,id};});
 return {counts:[...counts],families:n,plan,result:r,targets,foods,land:r.landArea,productiveArea,feedArea:r.feedLand.extra,holdingArea:r.feedLand.holding,homeLand:r.homeLand,siteLand:r.siteLand,farmCapex:r.farm,nonLandCapex:r.upfront,contingency:r.contingency,reserve:r.reserve,nonLandTotal:r.nonLandTotal,farmAnnual:total(r.rows,x=>x.monthly)*12,monthly:r.monthly,hours:r.hours,peakHours:r.peakHours,shared:true};
}
function combine(parts,counts){const keys=['land','productiveArea','feedArea','holdingArea','homeLand','siteLand','farmCapex','nonLandCapex','contingency','reserve','nonLandTotal','farmAnnual','monthly','hours','peakHours'];const r={counts:[...counts],families:parts.length,shared:false};for(const k of keys)r[k]=total(parts,x=>x[k]);r.foods=parts[0].foods.map((food,i)=>{const f={...food};for(const k of ['demand','target','production','surplus','qty'])f[k]=total(parts,x=>x.foods[i][k]);return f;});return r;}
export function mixCounts(n,weights){if(!Number.isInteger(n)||n<1||n>24||!Array.isArray(weights)||weights.length!==3||weights.some(x=>!Number.isFinite(x)||x<0)||total(weights,x=>x)<=0)throw new Error('Hibás családarány.');const sum=total(weights,x=>x),raw=weights.map(x=>n*x/sum),counts=raw.map(Math.floor);let remaining=n-total(counts,x=>x);const order=raw.map((v,i)=>({i,f:v-counts[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let k=0;k<remaining;k++)counts[order[k].i]++;return counts;}
export function estateDefaults(){return {price:40000000,area:11541,productiveArea:7063,maxHomes:null,sharedArea:500,fixedPurchase:250000,purchasePct:5,annualUpkeep:0,targetUse:70,maxFamilies:24};}
function validEstate(e){for(const k of ['price','area','sharedArea','fixedPurchase','purchasePct','annualUpkeep','targetUse','maxFamilies'])if(!Number.isFinite(e[k])||e[k]<0||e[k]>1e12)throw new Error('Hibás birtokadat: '+k);if(e.area<=0||e.price<=0||e.sharedArea>e.area||e.purchasePct>100||e.targetUse>100||!Number.isInteger(e.maxFamilies)||e.maxFamilies<1||e.maxFamilies>24)throw new Error('Hibás birtokarány vagy keresési korlát.');if(e.productiveArea!==null&&(!Number.isFinite(e.productiveArea)||e.productiveArea<0||e.productiveArea>e.area))throw new Error('Hibás használható termőterület.');if(e.maxHomes!==null&&(!Number.isInteger(e.maxHomes)||e.maxHomes<0||e.maxHomes>24))throw new Error('Hibás lakóegységkorlát.');}
export function evaluateEstate(profile,counts,estate,{shared=true}={}){
 validEstate(estate);const s=selfMix(profile,counts,{shared}),n=s.families,requiredArea=s.land+estate.sharedArea;
 const fees=estate.price*estate.purchasePct/100+estate.fixedPurchase,propertyCapital=estate.price+fees,totalStartup=s.nonLandTotal+propertyCapital+estate.annualUpkeep/12*profile.reserveMonths;
 const perFamily=totalStartup/n,estatePerFamily=propertyCapital/n,totalCapex=s.nonLandCapex+propertyCapital;
 const flags={area:requiredArea<=estate.area,productive:estate.productiveArea===null?null:s.productiveArea<=estate.productiveArea,homes:estate.maxHomes===null?null:n<=estate.maxHomes,budget:perFamily<=profile.budget,averageWork:s.hours/n<=profile.availableHours,peakWork:s.peakHours/n<=profile.availableHours};
 const feasible=Object.values(flags).every(v=>v!==false),specifiedConstraints=estate.productiveArea!==null&&estate.maxHomes!==null;
 const landUse=requiredArea/estate.area*100,surplusArea=Math.max(0,estate.area-requiredArea),unallocatedPrice=estate.price*surplusArea/estate.area;
 return {scenario:s,n,flags,feasible,specifiedConstraints,requiredArea,landUse,surplusArea,unallocatedPrice,unallocatedInterest:unallocatedPrice*profile.rate/100,propertyCapital,estatePerFamily,totalCapex,totalStartup,perFamily,propertyInterest:propertyCapital*profile.rate/100,totalInterest:totalCapex*profile.rate/100,monthlyPerFamily:(s.monthly+estate.annualUpkeep/12)/n};
}
export function fitEstate(profile,weights,estate,{shared=true}={}){
 validEstate(estate);const rows=[];
 for(let n=1;n<=estate.maxFamilies;n++){const counts=mixCounts(n,weights);if(weights.some((w,i)=>w>0&&counts[i]===0))continue;rows.push(evaluateEstate(profile,counts,estate,{shared}));}
 const candidates=rows.filter(r=>r.feasible),recommendation=candidates.find(r=>r.landUse>=estate.targetUse)||null;
 return {rows,candidates,recommendation,geometricMaximum:rows.filter(r=>r.flags.area).at(-1)?.n||0,conditional:estate.productiveArea===null||estate.maxHomes===null};
}
