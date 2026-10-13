// Unverified allocation examples, NOT measured task-time data or a work calendar.
// These shares explain existing totals; changing a profile must not change model hours.
const profiles={
 garden:[['Talaj-előkészítés',.15],['Vetés, palántázás / ültetés',.15],['Trágyázás, tápanyag-utánpótlás',.10],['Öntözés ellenőrzése / elvégzése',.15],['Gyomlálás, növényvédelem',.25],['Szedés, betakarítás, terméskezelés',.20]],
 orchard:[['Metszés, korona- és tőápolás',.25],['Trágyázás, tápanyag-utánpótlás',.10],['Öntözés',.15],['Gyomkezelés, növényvédelem',.20],['Szüret, válogatás és terméskezelés',.30]],
 grain:[['Talaj-előkészítés',.25],['Vetés',.15],['Trágyázás, tápanyag-utánpótlás',.20],['Gyomkezelés, növényvédelem',.15],['Betakarítás, szárítás / tárolás',.25]],
 forage:[['Terület- és állománykezelés',.20],['Tápanyag-utánpótlás',.15],['Kaszálás, betakarítás',.40],['Szárítás, behordás és tárolás',.25]],
 dairy:[['Etetés, itatás',.35],['Fejés, tejkezelés és eszközmosás',.35],['Almozás, takarítás, trágyakezelés',.20],['Állategészségügyi ellenőrzés, gondozás',.10]],
 layers:[['Etetés, itatás',.35],['Almozás, óltakarítás, trágyakezelés',.30],['Tojásgyűjtés, válogatás',.25],['Állategészségügyi ellenőrzés',.10]],
 animals:[['Etetés, itatás',.45],['Almozás, takarítás, trágyakezelés',.30],['Állategészségügyi ellenőrzés',.15],['Állománykezelés, mozgatás',.10]],
 bees:[['Állományvizsgálat, méhegészségügyi ellenőrzés',.35],['Kaptár- és állománykezelés',.25],['Mézelvétel, pergetés, mézkezelés',.25],['Szezonális előkészítés, teleltetés',.15]],
 woodland:[['Állománygondozás',.50],['Állomány- és területszemle',.30],['Pótlás, fiatal állomány kezelése',.20]],
 woodProcessing:[['Kitermelés, darabolás',.35],['Hasítás, feldolgozás',.35],['Rakodás, szárítási és tárolási kezelés',.30]],
};
export const WORK_PROFILES=profiles;
function profileFor(row){if(row.id==='firewood')return 'woodland';if(row.id==='hen')return 'layers';if(['cowmilk','goatmilk'].includes(row.id))return 'dairy';if(row.id==='bees')return 'bees';if(row.category==='Állatok')return 'animals';if(row.category==='Gyümölcsös')return 'orchard';if(row.id==='forage')return 'forage';if(['wheat','barley','maize','feedmaize','feedgrain'].includes(row.id))return 'grain';return 'garden';}
function split(profile,hours,peak,kind){return profiles[profile].map(([label,share])=>({label,share,hours:hours*share,annualHours:hours*share*12,peakHours:peak*share,kind}));}
export function workBlock(plan,row,{reference=row,peakReference=reference,owner=plan.family.name}={}){
 const scale=reference.qty?row.qty/reference.qty:0,peakScale=peakReference.qty?row.qty/peakReference.qty:0;
 const processing=row.wood?(reference.wood?.processingMonthlyHours||0)*scale:0;
 const processingPeak=row.wood?(peakReference.wood?.harvestPeakHours||0)*peakScale:0;
 const auto=row.autoHours||0,autoPeak=row.autoPeakHours||0;
 const base=Math.max(0,row.hours-auto-processing),basePeak=Math.max(0,row.peakHours-autoPeak-processingPeak);
 const groups=[{kind:'base',label:row.id==='firewood'?'Fás terület gondozása':'Tevékenység alapmunkája',hours:base,peakHours:basePeak,source:`catalogue.${row.id}.hours`,profile:profileFor(row)}];
 if(auto>0)groups.push({kind:'feed',label:'További saját takarmányföld munkája',hours:auto,peakHours:autoPeak,source:'assumptions.autoFeedHours',profile:row.feedKind==='forage'?'forage':'grain'});
 if(processing>0)groups.push({kind:'wood-processing',label:'Tűzifa kitermelése és feldolgozása',hours:processing,peakHours:processingPeak,source:'wood.processingHours',profile:'woodProcessing'});
 return {id:row.id,owner,label:row.name,hours:row.hours,peakHours:row.peakHours,plan,groups:groups.filter(g=>g.hours>0||g.peakHours>0).map(g=>({...g,tasks:split(g.profile,g.hours,g.peakHours,g.kind)}))};
}
export function familyWork(plan,result){const blocks=result.rows.filter(x=>x.hours>0||x.peakHours>0).map(row=>workBlock(plan,row));return {hours:result.hours,peakHours:result.peakHours,constructionHours:result.ownConstructionHours,blocks};}
export function groupWork(plans,g){
 const blocks=g.plotFamilies.flatMap((f,i)=>f.items.filter(x=>x.hours>0||x.peakHours>0).map(row=>workBlock(plans[i],row)));
 for(const row of g.merged.filter(x=>x.hours>0||x.peakHours>0)){
  const refs=g.conflicts.find(c=>c.id===row.id).participants;
  const average=refs.reduce((a,b)=>(a.row.hours-(a.row.autoHours||0))/a.row.qty>=(b.row.hours-(b.row.autoHours||0))/b.row.qty?a:b);
  const peak=refs.reduce((a,b)=>(a.row.peakHours-(a.row.autoPeakHours||0))/a.row.qty>=(b.row.peakHours-(b.row.autoPeakHours||0))/b.row.qty?a:b);
  blocks.push(workBlock(plans[average.index],row,{reference:average.row,peakReference:peak.row,owner:'Közös használat'}));
 }
 return {hours:g.hours,peakHours:g.peakHours,constructionHours:g.results.reduce((s,x)=>s+x.ownConstructionHours,0),blocks};
}
