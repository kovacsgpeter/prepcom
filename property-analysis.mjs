import {calculate,aggregate,validatePlan} from './model.mjs?v=20261013-8';
import {groupMapData} from './plot.mjs?v=20261015-2';
import {householdDemand,FOOD_PRODUCTS,FOOD_PRODUCERS} from './food.mjs?v=20261013-8';
import {MNB_BENCHMARK} from './feed-economics.mjs?v=20261013-8';
const sum=(xs,f=x=>x)=>xs.reduce((s,x)=>s+f(x),0),clone=x=>JSON.parse(JSON.stringify(x));
const cropTypes=new Set(['garden','greenhouse','orchard','berries','grain','forage','woodland']);
export function propertyDefaults(){return {area:11541,price:40000000,excludedArea:0,productiveArea:7063,maxHomes:null,purchasePct:5,purchaseFixed:250000,annualUpkeep:0,rate:MNB_BENCHMARK.rate};}
export function validateProperty(e){
 if(!e||typeof e!=='object')throw new Error('Hiányzó ingatlanadatok.');
 for(const key of ['area','excludedArea','purchasePct','purchaseFixed','annualUpkeep','rate'])if(!Number.isFinite(e[key])||e[key]<0||e[key]>1e12)throw new Error('Hibás ingatlanadat: '+key);
 if(e.area<=0||e.excludedArea>e.area||e.purchasePct>100||e.rate>100)throw new Error('Érvénytelen terület vagy százalék.');
 if(e.price!==null&&(!Number.isFinite(e.price)||e.price<=0||e.price>1e12))throw new Error('A teljes vételár pozitív szám vagy ismeretlen lehet.');
 if(e.productiveArea!==null&&(!Number.isFinite(e.productiveArea)||e.productiveArea<0||e.productiveArea>e.area-e.excludedArea))throw new Error('A használható termőterület nem lehet nagyobb a kizárt rész nélküli területnél.');
 if(e.maxHomes!==null&&(!Number.isInteger(e.maxHomes)||e.maxHomes<0||e.maxHomes>10000))throw new Error('A lakóegységek korlátja egész szám vagy ismeretlen lehet.');
 return e;
}
function capacity(area,productive,families,e){
 const factor=area>0?(e.area-e.excludedArea)/area:null;
 const areaCopies=factor===null?null:Math.max(0,Math.floor(factor+1e-9));
 const productiveCopies=e.productiveArea===null||productive===0?null:Math.max(0,Math.floor(e.productiveArea/productive+1e-9));
 const homeCopies=e.maxHomes===null?null:Math.floor(e.maxHomes/families);
 const limits=[areaCopies,productiveCopies,homeCopies].filter(x=>x!==null),copies=limits.length?Math.min(...limits):null;
 return {factor,areaCopies,productiveCopies,homeCopies,copies,totalFamilies:copies===null?null:copies*families,additionalCopies:copies===null?null:Math.max(0,copies-1),additionalFamilies:copies===null?null:Math.max(0,copies-1)*families,conditional:e.productiveArea===null||e.maxHomes===null};
}
export function propertyMap(base,e){
 validateProperty(e);const data=clone(base),shortage=Math.max(0,base.area+e.excludedArea-e.area),unplanned=Math.max(0,e.area-base.area-e.excludedArea);
 if(unplanned>1e-9)data.groups.push({id:'unplanned',name:'Hasznosításra nem tervezett',color:'#8c8c7b',area:unplanned,zones:[{id:'unplanned-land',label:'Hasznosításra nem tervezett terület',area:unplanned,type:'unplanned',icon:'open-land',qty:1,note:'Nincs a jelenlegi tervekben hozzárendelt használat. Nem feltétlenül parlag, értéktelen vagy művelésbe vonható föld.'}]});
 if(e.excludedArea>0)data.groups.push({id:'excluded',name:'Használatból kizárt',color:'#8d9796',area:e.excludedArea,zones:[{id:'excluded-land',label:'A tervezésből kizárt terület',area:e.excludedArea,type:'excluded',icon:'open-land',qty:1,note:'Az ingatlan része, a megadott használati korlát miatt nem számít szabad kapacitásnak.'}]});
 data.area=shortage>0?base.area+e.excludedArea:e.area;
 data.property={area:e.area,required:base.area,shortage,unplanned,excluded:e.excludedArea};
 return data;
}
function sourceProject(plans,config){
 if(!Array.isArray(plans)||plans.length<1||plans.length>24)throw new Error('Legalább egy, legfeljebb 24 családi terv szükséges.');
 const g=aggregate(plans,config),map=groupMapData(plans,g),productive=sum(map.groups.flatMap(x=>x.zones).filter(z=>cropTypes.has(z.type)),z=>z.area);
 const peakWater=sum(g.plotFamilies.flatMap(x=>x.items),r=>r.peakWater||0)+sum(g.merged,r=>r.peakWater||0)+sum(plans,p=>(p.family.adults+p.family.children)*p.assumptions.personWater*365/12);
 return {plans,group:g,map,productive,peakWater};
}
function financials(source,e,copies=1){
 const {plans,group:g}=source,n=plans.length*copies,known=e.price!==null,fees=known?e.price*e.purchasePct/100+e.purchaseFixed:null,propertyCapital=known?e.price+fees:null;
 const rows=g.rows.map((r,i)=>{const reserveMonths=g.results[i].reserveMonths,extraMonthly=e.annualUpkeep/12/n,extraReserve=extraMonthly*reserveMonths;
  const propertyShare=known?propertyCapital*r.share/copies:null,other=r.upfront+r.contingency+r.reserve+extraReserve,total=known?other+propertyShare:null;
  return {name:r.name,share:r.share/copies,upfront:r.upfront,contingency:r.contingency,reserve:r.reserve+extraReserve,other,propertyShare,total,budget:plans[i].family.budget,gap:total===null?null:Math.max(0,total-plans[i].family.budget),monthly:r.monthly+extraMonthly,water:r.water,averageWork:r.ownHours+r.assignedShared,availableHours:r.availableHours,peakWork:r.peakHours};});
 const totalStartup=known?sum(rows,r=>r.total)*copies:null,totalCapex=known?sum(g.rows,r=>r.upfront)*copies+propertyCapital:null;
 return {known,fees,propertyCapital,rows,copies,families:n,totalStartup,totalCapex,propertyPerFamily:known?propertyCapital/n:null,annualPropertyCost:known?propertyCapital*e.rate/100:null,annualCapitalCost:known?totalCapex*e.rate/100:null,individualGaps:known?sum(rows,r=>r.gap)*copies:null,totalBudget:sum(plans,p=>p.family.budget)*copies,monthly:g.monthly*copies+e.annualUpkeep/12,hours:g.hours*copies,peakHours:g.peakHours*copies,water:g.water*copies,peakWater:source.peakWater*copies};
}
export function analyzeProperty(plans,config,e){
 validateProperty(e);const source=sourceProject(plans,config),g=source.group,required=g.landArea,unplanned=Math.max(0,e.area-required-e.excludedArea),shortage=Math.max(0,required+e.excludedArea-e.area);
 const repeat=capacity(required,source.productive,plans.length,e),finance=financials(source,e),maxCopyFinance=repeat.copies>0?financials(source,e,repeat.copies):null;
 const individual=plans.map((p,i)=>({index:i,name:p.family.name,result:calculate(p),plan:p})).sort((a,b)=>b.result.landArea-a.result.landArea||a.index-b.index),largest=individual[0],largestSource=sourceProject([largest.plan],{});
 const largestCapacity=capacity(largest.result.landArea,largestSource.productive,1,e);
 return {source,g,map:propertyMap(source.map,e),required,productive:source.productive,unplanned,shortage,repeat,finance,maxCopyFinance,largest:{index:largest.index,name:largest.name,area:largest.result.landArea,capacity:largestCapacity,finance:largestCapacity.copies>0?financials(largestSource,e,largestCapacity.copies):null},unusedValue:e.price===null?null:e.price*unplanned/e.area,unusedAnnual:e.price===null?null:e.price*unplanned/e.area*e.rate/100,limits:{area:shortage<=1e-6,productive:e.productiveArea===null?null:source.productive<=e.productiveArea,homes:e.maxHomes===null?null:plans.length<=e.maxHomes,budget:finance.individualGaps===null?null:finance.individualGaps<=1e-6,food:g.foodResults.every(x=>x.shortage<=1e-6),wood:!g.woodResults||g.woodResults.shortage<=1e-6,work:!!config.externalHelp||(g.sharedShortage<=1e-6&&g.ownShortages.every(x=>x<=1e-6)),peak:g.rows.every((r,i)=>r.peakHours<=plans[i].family.availableHours)}};
}
export function fixedFarmDefaults(plan){
 const r=calculate(plan),ids=new Set(plan.items.map(x=>x.id));
 const goals=Object.fromEntries(Object.keys(FOOD_PRODUCTS).map(product=>{const producers=plan.items.filter(i=>FOOD_PRODUCERS[i.id]?.product===product),self=producers.filter(i=>i.quantityMode==='self');return [product,self.length?Math.min(100,sum(self,x=>x.selfTargetPct)):producers.length?100:0];}));
 return {quantities:Object.fromEntries(r.rows.filter(x=>ids.has(x.id)).map(x=>[x.id,x.qty])),goals,annualNeeds:Object.fromEntries(Object.keys(FOOD_PRODUCTS).map(product=>[product,householdDemand(plan,product)])),feedShare:r.feedShare*100};
}
export function fixedFarmPlan(template,quantities,feedShare){
 const p=validatePlan(clone(template));if(!Number.isFinite(feedShare)||feedShare<0||feedShare>100)throw new Error('A saját takarmány 0–100% lehet.');p.preferences.feedFlexible=false;p.assumptions.feedShare=feedShare;
 p.items=p.items.map(i=>{const qty=quantities[i.id],c=p.catalogue.find(x=>x.id===i.id);if(!Number.isFinite(qty)||qty<0||qty>1e7||c.unit!=='m²'&&!Number.isInteger(qty))throw new Error('Hibás rögzített mennyiség: '+c.name);return {...i,min:qty,wish:qty,locked:true,quantityMode:'manual'};});
 return validatePlan(p);
}
export function fixedFarmCapacity(template,settings,e){
 validateProperty(e);const p=fixedFarmPlan(template,settings.quantities,settings.feedShare),r=calculate(p),stock=sum(r.rows,x=>x.area),perFamily=r.homeLand+r.siteLand;
 const foods=Object.keys(FOOD_PRODUCTS).map(product=>{const pct=settings.goals[product],need=settings.annualNeeds[product];if(!Number.isFinite(pct)||pct<0||pct>100||!Number.isFinite(need)||need<0||need>1e9)throw new Error('Hibás éves élelmiszercél.');const production=r.foodResults.find(x=>x.product===product)?.production||0,target=need*pct/100;return {product,name:FOOD_PRODUCTS[product].name,unit:FOOD_PRODUCTS[product].unit,production,target,pct,need,capacity:target>0?Math.max(0,Math.floor(production/target+1e-9)):null};});
 const goals=foods.filter(f=>f.capacity!==null),foodCapacity=goals.length?Math.min(...goals.map(f=>f.capacity)):null;
 const rows=[];for(let n=1;n<=24;n++){
  const scaled=clone(p);scaled.family.adults*=n;scaled.family.children*=n;scaled.family.budget*=n;scaled.family.availableHours*=n;scaled.family.livingMonthly*=n;scaled.assumptions.heatingMonthly*=n;scaled.wood.annualNeed*=n;
  scaled.home={...scaled.home,min:r.homeArea*n,wish:r.homeArea*n,locked:true};for(const key of Object.keys(scaled.site))if(typeof scaled.site[key]==='number')scaled.site[key]*=n;
  for(const service of Object.values(scaled.serviceCatalogue))for(const option of Object.values(service.options)){option.setup*=n;option.monthly*=n;}
  for(const c of Object.values(scaled.food.consumption))if(c.mode==='manual')c.annualHousehold*=n;
  const x=calculate(scaled),fees=e.price===null?null:e.price*e.purchasePct/100+e.purchaseFixed,propertyCapital=e.price===null?null:e.price+fees,extraReserve=e.annualUpkeep/12*x.reserveMonths,total=propertyCapital===null?null:x.nonLandTotal+propertyCapital+extraReserve;
  const flags={food:foodCapacity===null?null:n<=foodCapacity,area:x.landArea<=e.area-e.excludedArea,homes:e.maxHomes===null?null:n<=e.maxHomes,productive:e.productiveArea===null?null:sum(x.rows.filter(y=>y.category!=='Állatok'),y=>y.wood?y.wood.growingArea:y.area)+sum(x.rows,y=>y.autoArea)<=e.productiveArea,budget:total===null?null:total/n<=p.family.budget,averageWork:x.hours/n<=p.family.availableHours,peakWork:x.peakHours/n<=p.family.availableHours};
  rows.push({n,land:x.landArea,total,perFamily:total===null?null:total/n,propertyPerFamily:propertyCapital===null?null:propertyCapital/n,totalCapex:propertyCapital===null?null:x.upfront+propertyCapital,annualCapitalCost:propertyCapital===null?null:(x.upfront+propertyCapital)*e.rate/100,monthly:(x.monthly+e.annualUpkeep/12)/n,hours:x.hours,peakHours:x.peakHours,water:x.water,flags,possible:Object.values(flags).every(v=>v!==false),result:x,plan:scaled});
 }
 const candidates=foodCapacity===null?[]:rows.filter(x=>x.possible),best=candidates.at(-1)||null;
 return {plan:p,result:r,foods,foodCapacity,stockArea:stock,perFamilyLand:perFamily,rows,candidates,best,conditional:e.maxHomes===null||e.productiveArea===null||e.price===null};
}
