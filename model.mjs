import { CATALOGUE, DEFAULT_ASSUMPTIONS, SERVICES } from './data.mjs';

export const clamp = (v,lo=0,hi=1) => Math.min(hi,Math.max(lo,v));
const sum = (xs, fn=x=>x) => xs.reduce((s,x)=>s+fn(x),0);
const blend = (min,wish,weight,locked,minimum) => locked ? wish : minimum ? min : min+(wish-min)*clamp(2*weight);
export function calculate(plan,{minimum=false}={}) {
  const a=plan.assumptions, p=plan.preferences;
  const w=p.budgetMode==='landBudget'?p.landBudget:p.balance;
  const homeArea=blend(plan.home.min,plan.home.wish,w[0],plan.home.locked,minimum);
  const reserveMonths=p.budgetMode==='landBudget'&&!minimum?plan.reserve.wish:blend(plan.reserve.min,plan.reserve.wish,w[2],plan.reserve.locked,minimum);
  const [land,labour,cost]=p.resources;
  const feedShare=clamp(a.feedShare/100+(p.feedFlexible?.5*(cost-land):0));
  const autoLevel=p.irrigation?clamp(labour*2):0;
  const machineLevel=p.machinery?clamp(labour*2):0;
  const catalogue=new Map(plan.catalogue.map(x=>[x.id,x]));
  const rows=plan.items.map(item=>{
    const c=catalogue.get(item.id), blended=blend(item.min,item.wish,w[1],item.locked,minimum);
    const qty=c.unit==='m²'?blended:Math.ceil(blended-1e-9);
    const crop=c.category!=='Állatok';
    const efficiency=crop?Math.max(.05,1-a.irrigationLabourSaving/100*autoLevel-a.machineryLabourSaving/100*machineLevel):1;
    const waterEfficiency=crop?1-a.irrigationWaterSaving/100*autoLevel:1;
    const row={ id:item.id,name:c.name,icon:c.icon,unit:c.unit,scope:item.scope,minQty:item.locked?item.wish:item.min,qty,
      area:qty*c.area,setup:item.owned?0:qty*c.setup,monthly:qty*c.monthly,water:qty*c.water*waterEfficiency,
      hours:qty*c.hours*efficiency,peakHours:qty*c.hours*c.peak*efficiency,peakWater:qty*c.water*c.waterPeak*waterEfficiency,
      feedKg:qty*(c.feed||0)*365,ownFeedKg:qty*(c.feed||0)*365*feedShare,feedProduced:qty*(c.feedYield||0),feedKind:c.feedKind,autoArea:0,autoSetup:0,autoMonthly:0,autoHours:0,autoPeakHours:0,
      autoRates:{areaPerKg:1/(c.feedKind==='grain'?a.grainYield:a.forageYield),setup:a.autoFeedSetup,monthly:a.autoFeedMonthly,hours:a.autoFeedHours*(1-a.machineryLabourSaving/100*machineLevel)},
    };
    if(c.feed) row.monthly+=row.feedKg/12*(1-feedShare)*c.feedPrice;
    return row;
  });
  const autoFeedByKind={};
  for(const kind of ['grain','forage']) {
    const needed=sum(rows.filter(x=>x.feedKg&&x.feedKind===kind),x=>x.feedKg*feedShare);
    const explicit=sum(rows.filter(x=>catalogue.get(x.id).feedYield&&x.feedKind===kind),x=>x.qty*catalogue.get(x.id).feedYield);
    const yieldPerM2=kind==='grain'?a.grainYield:a.forageYield;
    const extra=Math.max(0,needed-explicit)/yieldPerM2;
    autoFeedByKind[kind]={needed,explicit,extra};
    for(const row of rows.filter(x=>x.feedKg&&x.feedKind===kind)) {
      const share=needed?row.feedKg*feedShare/needed:0;
      const area=extra*share;
      row.autoArea=area; row.autoSetup=area*a.autoFeedSetup;
      row.autoMonthly=area*a.autoFeedMonthly;
      row.area+=area;row.setup+=row.autoSetup;row.monthly+=row.autoMonthly;
      row.autoHours=area*row.autoRates.hours;row.autoPeakHours=row.autoHours*4;
      row.hours+=row.autoHours;
      row.peakHours+=row.autoPeakHours;
    }
  }
  const cropArea=sum(rows.filter(x=>catalogue.get(x.id).category!=='Állatok'),x=>x.qty*catalogue.get(x.id).area);
  const irrigationCost=cropArea*a.irrigationSetup*autoLevel;
  const machineryCost=rows.length?a.machinerySetup*machineLevel:0;
  const serviceRows=Object.entries(plan.serviceCatalogue).map(([id,s])=>{
    let option=plan.services[id];
    if(option==='cheapest') option=Object.keys(s.options).sort((a,b)=>(s.options[a].setup+120*s.options[a].monthly)-(s.options[b].setup+120*s.options[b].monthly))[0];
    return {id:`service-${id}`,name:s.name,icon:s.icon,option,optionName:s.options[option].name,unit:'rendszer',qty:1,minQty:1,scope:'family',area:0,setup:s.options[option].setup,monthly:s.options[option].monthly,hours:0,peakHours:0,water:0,peakWater:0,autoArea:0};
  });
  for(const [id,name,icon,setup,scope,area,qty] of [
    ['equipment-tools','Alap szerszámok','🔧',plan.site.ownedTools?0:plan.site.tools,plan.site.toolsScope,0,1],
    ['equipment-machinery','Gépesítés','🚜',machineryCost,p.machineryScope,0,p.machinery&&rows.length?1:0],
    ['site-fence','Kerítés','▥',plan.site.fence,plan.site.fenceScope,0,1],
    ['site-outbuildings','Tároló / műhely','🏚️',plan.site.outbuildings,plan.site.outbuildingsScope,plan.site.storage,1],
  ])serviceRows.push({id,name,icon,setup,scope,area,qty,minQty:qty,unit:'rendszer',monthly:0,hours:0,peakHours:0,water:0,peakWater:0,autoArea:0});
  const houseBase=homeArea*a[{economy:'buildEconomy',standard:'buildStandard',comfort:'buildComfort'}[plan.home.level]];
  const house=houseBase*(1-plan.home.ownWorkPct/100);
  const design=houseBase*a.designPct/100;
  const ownConstructionHours=homeArea*a.constructionHours*plan.home.ownWorkPct/100;
  const farm=sum(rows,x=>x.setup);
  const infrastructure=sum(serviceRows,x=>x.setup)+irrigationCost+sum(['surveys','relocation','otherSetup'],k=>plan.site[k]);
  const upfront=house+design+farm+infrastructure;
  const contingency=upfront*a.contingencyPct/100;
  const monthly=plan.family.livingMonthly+a.heatingMonthly+sum(serviceRows,x=>x.monthly)+sum(rows,x=>x.monthly)+plan.site.otherMonthly;
  const reserve=monthly*reserveMonths;
  const cashForLand=plan.family.budget-upfront-contingency-reserve;
  const landBudget=(cashForLand-a.purchaseFixed)/(1+a.purchasePct/100);
  const homeLand=homeArea*a.houseLandFactor;
  const siteLand=sum(['paths','storage','parking','expansion','wastewater'],k=>plan.site[k]);
  const landArea=homeLand+siteLand+sum(rows,x=>x.area);
  const hours=sum(rows,x=>x.hours),peakHours=sum(rows,x=>x.peakHours);
  const domesticWater=(plan.family.adults+plan.family.children)*a.personWater*365/12;
  const water=domesticWater+sum(rows,x=>x.water),peakWater=domesticWater+sum(rows,x=>x.peakWater);
  return {homeArea,reserveMonths,feedShare,rows,serviceRows,house,design,farm,infrastructure,upfront,contingency,monthly,reserve,landBudget,cashForLand,homeLand,siteLand,landArea,hours,peakHours,water,peakWater,ownConstructionHours,autoFeedByKind,
    breakdown:[{name:'Házépítés',value:house,color:'#d78c53'},{name:'Tervezés',value:design,color:'#e9ba7c'},{name:'Gazdaság indítása',value:farm,color:'#718a51'},{name:'Infrastruktúra, eszközök',value:infrastructure,color:'#99aaa3'},{name:'Biztonsági keret',value:contingency,color:'#d5bfa0'},{name:'Működési tartalék',value:reserve,color:'#8faeb4'},{name:'Telek és vásárlási költségek',value:Math.max(0,cashForLand),color:'#254f3c'}]};
}

const positiveFields=['area','setup','monthly','water','hours','peak','waterPeak'];
function number(v,label,min=0,max=1e12) { if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) throw new Error(`${label}: érvénytelen szám.`); }
function range(x,label,max) {
  if(!x||typeof x!=='object') throw new Error(`${label}: hiányzó adatok.`);
  number(x.min,label,0,max);number(x.wish,label,0,max);
  if(x.min>x.wish) throw new Error(`${label}: a minimum nagyobb a kívánt értéknél.`);
  if(typeof x.locked!=='boolean') throw new Error(`${label}: hibás rögzítés.`);
}
export function validatePlan(raw) {
  if(!raw||raw.schemaVersion!==1) throw new Error('Ismeretlen tervformátum. 1-es verziójú családi JSON szükséges.');
  const p=JSON.parse(JSON.stringify(raw));
  if(typeof p.family?.name!=='string'||!p.family.name.trim()||p.family.name.length>80) throw new Error('A családnév 1–80 karakter lehet.');
  for(const k of ['adults','children']) {number(p.family[k],k,0,100);if(!Number.isInteger(p.family[k]))throw new Error('A létszám egész szám legyen.');}
  if(p.family.adults+p.family.children===0)throw new Error('Legalább egy családtag szükséges.');
  number(p.family.budget,'Teljes keret');number(p.family.availableHours,'Munkaóra',0,5000);number(p.family.livingMonthly,'Megélhetés');
  range(p.home,'Ház',2000);range(p.reserve,'Tartalék',120);
  if(!['economy','standard','comfort'].includes(p.home.level))throw new Error('Ismeretlen építési szint.');
  number(p.home.ownWorkPct,'Saját építési munka',0,30);
  for(const k of ['paths','storage','parking','expansion','wastewater','fence','tools','outbuildings','surveys','relocation','otherSetup','otherMonthly'])number(p.site?.[k],k,0,1e9);
  if(typeof p.site.ownedTools!=='boolean')throw new Error('Hibás meglévőeszköz-beállítás.');
  for(const k of ['toolsScope','fenceScope','outbuildingsScope'])if(!['family','shared'].includes(p.site[k]))throw new Error('Hibás infrastruktúra-megosztás.');
  for(const [id,s] of Object.entries(SERVICES)) {
    if(![...Object.keys(s.options),'cheapest'].includes(p.services?.[id]))throw new Error('Ismeretlen közműmegoldás.');
    const local=p.serviceCatalogue?.[id];
    if(!local||local.name!==s.name||local.icon!==s.icon)throw new Error('Hiányzó közműalapadatok.');
    if(!local.options||Object.keys(local.options).some(k=>!(k in s.options)))throw new Error('Ismeretlen közműmegoldás a katalógusban.');
    for(const [key,option] of Object.entries(s.options)) {
      if(local.options?.[key]?.name!==option.name)throw new Error('Hiányzó közműmegoldás.');
      number(local.options[key].setup,'Közmű telepítés');number(local.options[key].monthly,'Közmű fenntartás');
    }
  }
  if(Object.keys(p.serviceCatalogue).some(k=>!(k in SERVICES)))throw new Error('Ismeretlen közműkatalógus.');
  if(!p.assumptions||Object.keys(DEFAULT_ASSUMPTIONS).some(k=>!(k in p.assumptions)))throw new Error('Hiányzó alapadatok.');
  for(const k of Object.keys(DEFAULT_ASSUMPTIONS))number(p.assumptions[k],k,0,1e9);
  for(const k of ['irrigationLabourSaving','machineryLabourSaving','irrigationWaterSaving'])number(p.assumptions[k],k,0,95);
  if(p.assumptions.houseLandFactor<1||p.assumptions.feedShare>100||p.assumptions.contingencyPct>100||p.assumptions.designPct>100||p.assumptions.purchasePct>100||p.assumptions.grainYield<=0||p.assumptions.forageYield<=0)throw new Error('Érvénytelen arány vagy hozam az alapadatokban.');
  if(!Array.isArray(p.catalogue)||p.catalogue.length>100)throw new Error('Hibás katalógus.');
  const ids=new Set();
  for(const c of p.catalogue) {
    if(typeof c.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(c.id)||ids.has(c.id))throw new Error('Hibás vagy ismétlődő tevékenységazonosító.');
    ids.add(c.id);
    for(const k of ['name','unit','icon','category'])if(typeof c[k]!=='string'||c[k].length>120)throw new Error('Hibás katalógusszöveg.');
    for(const k of positiveFields)number(c[k],c.name,0,1e9);
    if(c.feedKind&&!['grain','forage'].includes(c.feedKind))throw new Error('Ismeretlen takarmánytípus.');
    for(const k of ['feed','feedPrice','feedYield'])if(k in c)number(c[k],c.name,0,1e9);
    if(c.feedYield===0)throw new Error('A takarmányhozamnak pozitívnak kell lennie.');
    if(c.feed&&(!c.feedKind||!Number.isFinite(c.feedPrice)))throw new Error('Hiányzó takarmányadat.');
  }
  if(!Array.isArray(p.items)||p.items.length>100)throw new Error('Hibás tevékenységlista.');
  const used=new Set();
  for(const i of p.items){if(!ids.has(i.id)||used.has(i.id))throw new Error('Ismeretlen vagy ismétlődő tevékenység.');used.add(i.id);range(i,i.id,1e7);if(!['family','shared'].includes(i.scope)||typeof i.owned!=='boolean')throw new Error('Hibás tevékenység-beállítás.');const c=p.catalogue.find(x=>x.id===i.id);if(c.unit!=='m²'&&(!Number.isInteger(i.min)||!Number.isInteger(i.wish)))throw new Error('Az állat-, fa- és bokorszám egész szám legyen.');}
  if(!['balance','landBudget'].includes(p.preferences?.budgetMode))throw new Error('Hibás háromszögmód.');
  for(const k of ['balance','landBudget','resources']) {
    const w=p.preferences[k];if(!Array.isArray(w)||w.length!==3)throw new Error('Hibás háromszögpont.');
    w.forEach(x=>number(x,k,0,1));if(Math.abs(sum(w)-1)>.001)throw new Error('A háromszög súlyainak összege nem 1.');
  }
  for(const k of ['feedFlexible','irrigation','machinery'])if(typeof p.preferences[k]!=='boolean')throw new Error('Hibás gazdálkodási választás.');
  if(!['family','shared'].includes(p.preferences.machineryScope))throw new Error('Hibás gépmegosztás.');
  if(typeof p.dataVersion!=='string'||p.dataVersion.length>80)throw new Error('Hiányzó adatverzió.');
  p.sources??={};
  if(!p.sources||typeof p.sources!=='object'||Array.isArray(p.sources)||Object.keys(p.sources).length>1000)throw new Error('Hibás forrásjegyzék.');
  for(const [path,source] of Object.entries(p.sources)) {
    if(!/^(assumptions|catalogue|serviceCatalogue)\.[a-zA-Z0-9.-]+$/.test(path)||path.split('.').some(x=>['__proto__','prototype','constructor'].includes(x)))throw new Error('Hibás forrásazonosító.');
    if(!source||typeof source!=='object')throw new Error('Hibás forrásadat.');
    for(const k of ['title','url','date','note'])if(k in source&&(typeof source[k]!=='string'||source[k].length>2000))throw new Error('Hibás forrásszöveg.');
    if(source.url){let u;try{u=new URL(source.url)}catch{throw new Error('Érvénytelen forráslink.')};if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Csak nyilvános HTTP/HTTPS forráslink adható meg.');}
    if(source.status&&!['estimate','provided','verified'].includes(source.status))throw new Error('Hibás forrásminősítés.');
  }
  return p;
}

// A geometric controller represents preferences; its percentages are not currency shares.
export const VERTICES=[[160,32],[28,252],[292,252]];
export function pointFromWeights(w) {return VERTICES[0].map((_,axis)=>sum(VERTICES,(v)=>v[axis]*w[VERTICES.indexOf(v)]));}
export function weightsFromPoint(x,y) {
  let best=null;
  const [a,b,c]=VERTICES,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
  if(u>=0&&v>=0&&u+v<=1)return [u,v,1-u-v];
  for(let i=0;i<3;i++) {
    const j=(i+1)%3,A=VERTICES[i],B=VERTICES[j],dx=B[0]-A[0],dy=B[1]-A[1];
    const t=clamp(((x-A[0])*dx+(y-A[1])*dy)/(dx*dx+dy*dy));
    const px=A[0]+t*dx,py=A[1]+t*dy,d=(px-x)**2+(py-y)**2;
    if(!best||d<best.d){const w=[0,0,0];w[i]=1-t;w[j]=t;best={d,w};}
  }
  return best.w;
}

const sharedMetrics=['area','setup','monthly','water','hours','peakHours','peakWater','autoArea'];
const autoMetrics={area:'autoArea',setup:'autoSetup',monthly:'autoMonthly',hours:'autoHours',peakHours:'autoPeakHours'};
function reconcileSharedFeed(familyRows,sharedRows) {
  const all=[...familyRows.flat(),...sharedRows];
  for(const row of all)for(const [metric,auto] of Object.entries(autoMetrics)){row[metric]-=row[auto]||0;row[auto]=0;}
  function addArea(animals,missing) {
    const need=sum(animals,x=>x.ownFeedKg||0);
    for(const row of animals){const extra=need?missing*(row.ownFeedKg/need)*row.autoRates.areaPerKg:0;row.autoArea=extra;row.autoSetup=extra*row.autoRates.setup;row.autoMonthly=extra*row.autoRates.monthly;row.autoHours=extra*row.autoRates.hours;row.autoPeakHours=row.autoHours*4;for(const [metric,auto] of Object.entries(autoMetrics))row[metric]+=row[auto];}
  }
  for(const kind of ['grain','forage']) {
    const sharedAnimals=sharedRows.filter(x=>x.feedKind===kind&&x.ownFeedKg>0);
    const sharedNeed=sum(sharedAnimals,x=>x.ownFeedKg),sharedYield=sum(sharedRows.filter(x=>x.feedKind===kind),x=>x.feedProduced||0);
    addArea(sharedAnimals,Math.max(0,sharedNeed-sharedYield));
    const commonRemainder=Math.max(0,sharedYield-sharedNeed);
    const buckets=familyRows.map(rows=>{const animals=rows.filter(x=>x.feedKind===kind&&x.ownFeedKg>0),need=sum(animals,x=>x.ownFeedKg),produced=sum(rows.filter(x=>x.feedKind===kind),x=>x.feedProduced||0);return {animals,missing:Math.max(0,need-produced)};});
    const deficit=sum(buckets,x=>x.missing);
    for(const b of buckets)addArea(b.animals,Math.max(0,b.missing-(deficit?Math.min(commonRemainder,deficit)*b.missing/deficit:0)));
  }
}
export function aggregate(plans,{decisions={},landShares=[],workHours=[],hourlyRate=3000,externalRate=5000,externalHelp=false,monthlyPledges=[],landPrice=0}={}) {
  if(!plans.length)return null;
  for(const [name,value] of Object.entries({hourlyRate,externalRate,landPrice}))number(value,name,0,1e9);
  for(const pledge of monthlyPledges)if(pledge!==undefined&&pledge!==null)number(pledge,'Havi vállalás');
  const n=plans.length,results=plans.map(p=>calculate(p)),mins=plans.map(p=>calculate(p,{minimum:true}));
  const conflicts=[],merged=[],mergedMinimum=[];
  const reductions=plans.map(()=>({setup:0,monthly:0,area:0,hours:0,peakHours:0,water:0,peakWater:0,minArea:0}));
  const candidates=new Set(results.flatMap(r=>[...r.rows.filter(x=>x.scope==='shared').map(x=>x.id),...r.serviceRows.filter(x=>x.id.startsWith('service-')||x.scope==='shared').map(x=>x.id)]));
  for(const id of candidates) {
    const participating=results.map((r,index)=>({index,row:[...r.rows,...r.serviceRows].find(x=>x.id===id),min:[...mins[index].rows,...mins[index].serviceRows].find(x=>x.id===id)})).filter(x=>x.row&&x.row.qty>0);
    if(!participating.length||(participating.length<2&&(n<2||!participating.some(x=>x.row.scope==='shared'))))continue;
    const d=decisions[id];
    conflicts.push({id,name:participating[0].row.name,unit:participating[0].row.unit,participants:participating,decision:d,
      mixedScope:new Set(participating.map(x=>x.row.scope)).size>1,mixedOptions:new Set(participating.map(x=>x.row.option).filter(Boolean)).size>1});
    if(d&&!['separate','shared'].includes(d.strategy))throw new Error('Ismeretlen közös döntés.');
    if(!d||d.strategy!=='shared')continue;
    const minimum=d.minimum??Math.max(...participating.map(x=>x.row.minQty));
    const qty=d.quantity??Math.max(...participating.map(x=>x.row.qty));
    if(!Number.isFinite(qty)||!Number.isFinite(minimum)||qty<minimum||minimum<0)throw new Error('A közös mennyiség nem lehet kisebb a közös minimumnál.');
    if(participating[0].row.unit!=='m²'&&(!Number.isInteger(qty)||!Number.isInteger(minimum)))throw new Error('A közös darabszám egész szám legyen.');
    const row={id,name:participating[0].row.name,icon:participating[0].row.icon,unit:participating[0].row.unit,qty,minQty:minimum,scope:'shared',minimumArea:0};
    for(const metric of sharedMetrics)row[metric]=metric==='autoArea'?0:qty*Math.max(...participating.map(x=>(x.row[metric]-(x.row[autoMetrics[metric]]||0))/x.row.qty));
    row.ownFeedKg=qty*Math.max(...participating.map(x=>(x.row.ownFeedKg||0)/x.row.qty));
    row.feedProduced=qty*Math.min(...participating.map(x=>(x.row.feedProduced||0)/x.row.qty));
    row.feedKind=participating[0].row.feedKind;
    row.autoRates=Object.fromEntries(['areaPerKg','setup','monthly','hours'].map(key=>[key,Math.max(...participating.map(x=>x.row.autoRates?.[key]||0))]));
    const minRow={...row,qty:minimum};
    for(const metric of sharedMetrics)minRow[metric]=metric==='autoArea'?0:minimum*Math.max(...participating.map(x=>{const original=x.min.qty?x.min:x.row;return (original[metric]-(original[autoMetrics[metric]]||0))/original.qty;}));
    minRow.ownFeedKg=minimum*(qty?row.ownFeedKg/qty:Math.max(...participating.map(x=>(x.row.ownFeedKg||0)/x.row.qty)));
    minRow.feedProduced=minimum*(qty?row.feedProduced/qty:Math.min(...participating.map(x=>(x.row.feedProduced||0)/x.row.qty)));
    for(const {index,row:original,min} of participating) {
      for(const metric of ['setup','monthly','area','hours','peakHours','water','peakWater'])reductions[index][metric]+=original[metric];
      reductions[index].minArea+=min.area;
    }
    merged.push(row);mergedMinimum.push(minRow);
  }
  const retained=results.map(r=>r.rows.filter(x=>!merged.some(y=>y.id===x.id)).map(x=>({...x})));
  const retainedMinimum=mins.map(r=>r.rows.filter(x=>!merged.some(y=>y.id===x.id)).map(x=>({...x})));
  reconcileSharedFeed(retained,merged);reconcileSharedFeed(retainedMinimum,mergedMinimum);
  retained.forEach((rows,i)=>rows.forEach(row=>{const original=results[i].rows.find(x=>x.id===row.id);for(const metric of ['setup','monthly','area','hours','peakHours'])reductions[i][metric]-=row[metric]-original[metric];}));
  retainedMinimum.forEach((rows,i)=>rows.forEach(row=>{const original=mins[i].rows.find(x=>x.id===row.id);reductions[i].minArea-=row.area-original.area;}));
  merged.forEach((row,i)=>row.minimumArea=mergedMinimum[i].area);
  const unresolved=conflicts.filter(x=>!x.decision).length;
  const sharedSetup=sum(merged,x=>x.setup),sharedMonthly=sum(merged,x=>x.monthly),sharedArea=sum(merged,x=>x.area);
  const sharedHours=sum(merged,x=>x.hours),sharedPeakHours=sum(merged,x=>x.peakHours);
  const shares=landShares.length===n?landShares:plans.map(()=>1/n);
  if(shares.some(x=>!Number.isFinite(x)||x<0)||Math.abs(sum(shares)-1)>.001)throw new Error('A földvásárlási arányok összege 100% legyen.');
  const ownHours=results.map((r,i)=>r.hours-reductions[i].hours);
  const actual=plans.map((p,i)=>workHours[i]??Math.min(sharedHours/n,Math.max(0,p.family.availableHours-ownHours[i])));
  if(actual.some(x=>!Number.isFinite(x)||x<0)||sum(actual)>sharedHours+.01)throw new Error('A közös óravállalás nem haladhatja meg a közös feladat óraszámát.');
  const sharedShortage=Math.max(0,sharedHours-sum(actual));
  const ownShortages=plans.map((p,i)=>Math.max(0,ownHours[i]+actual[i]-p.family.availableHours));
  const rows=plans.map((p,i)=>{
    const r=results[i],red=reductions[i];
    const upfront=r.upfront-red.setup+sharedSetup/n;
    const contingency=upfront*p.assumptions.contingencyPct/100;
    // Only covered internal work is compensated. Uncovered hours are shown separately.
    const transfer=(sum(actual)/n-actual[i])*hourlyRate;
    const external=externalHelp?(sharedShortage/n+ownShortages[i])*externalRate:0;
    const monthly=r.monthly-red.monthly+sharedMonthly/n+transfer+external;
    const reserve=Math.max(0,monthly)*r.reserveMonths;
    const cashForLand=p.family.budget-upfront-contingency-reserve;
    const landBudget=(cashForLand-p.assumptions.purchaseFixed)/(1+p.assumptions.purchasePct/100);
    const landArea=r.landArea-red.area+sharedArea/n;
    const minArea=mins[i].landArea-red.minArea+sum(merged,x=>x.minimumArea)/n;
    return {name:p.family.name,upfront,contingency,monthly,reserve,landBudget,cashForLand,landArea,minArea,ownHours:ownHours[i],assignedShared:sharedHours/n,workHours:actual[i],requiredHours:ownHours[i]+actual[i],availableHours:p.family.availableHours,transfer,external,share:shares[i],pledge:monthlyPledges[i]??null,
      peakHours:r.peakHours-red.peakHours+sharedPeakHours/n,homeArea:r.homeArea,water:r.water-red.water+sum(merged,x=>x.water)/n};
  });
  const landBudgetLimit=Math.min(...rows.filter(r=>r.share>0).map(r=>r.landBudget/r.share));
  const pool=sum(rows,x=>x.landBudget);
  const landArea=sum(rows,x=>x.landArea),minimumArea=sum(rows,x=>x.minArea);
  const maximumArea=landPrice>0?Math.max(0,landBudgetLimit)/landPrice:null;
  const monthly=sum(rows,x=>x.monthly);
  const familyOnly=results.flatMap((r,i)=>r.rows.filter(x=>!merged.some(y=>y.id===x.id)).map(x=>({...x,familyIndex:i})));
  const quantities=new Map();
  for(const item of [...familyOnly,...merged]) {const prev=quantities.get(item.id)||{id:item.id,name:item.name,unit:item.unit,icon:item.icon,qty:0};prev.qty+=item.qty;quantities.set(item.id,prev);}
  return {rows,results,mins,conflicts,merged,unresolved,sharedHours,sharedShortage,ownShortages,landBudgetLimit,pool,landArea,minimumArea,maximumArea,monthly,quantities:[...quantities.values()],totalPledge:sum(rows,x=>x.pledge||0),allPledged:rows.every(x=>x.pledge!==null),
    hours:sum(rows,x=>x.requiredHours)+sharedShortage,peakHours:sum(rows,x=>x.peakHours),water:sum(rows,x=>x.water),
    feasible:!unresolved&&rows.every(x=>x.landBudget>=0)&&(externalHelp||(!sharedShortage&&ownShortages.every(x=>x===0)))&&(maximumArea===null||maximumArea>=landArea)};
}
