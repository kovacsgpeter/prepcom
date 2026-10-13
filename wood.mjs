// Provisional scenarios. Volumes always mean solid wood m³, never stacked or bulk m³.
export const WOOD_FIELDS={
 annualNeed:['Teljes éves tűzifaigény','tömör m³/év',0,10000],
 annualIncrement:['Átlagos éves fanövedék','tömör m³/ha/év',.01,1000],
 usablePct:['Tűzifaként hasznosítható hányad','%',.01,100],
 rotationYears:['Vágásforduló','év',1,200],
 yearsToFirstHarvest:['Új telepítés első kitermeléséig','év',1,200],
 dryingYears:['Szárítás ideje','év',0,10],
 reserveYears:['Száraz tűzifa biztonsági készlete','év',0,10],
 stackFactor:['Rakott térfogat / tömör térfogat','rakott m³/tömör m³',1,5],
 stackHeight:['Tárolási magasság','m',.1,5],
 storageSetup:['Szellős fatároló kialakítása','Ft/m²',0,1e7],
 processingCost:['Kitermelés és feldolgozás anyag/gép költsége','Ft/tömör m³',0,1e7],
 processingHours:['Kitermelés, hasítás és rakodás saját munkája','óra/tömör m³',0,10000],
 purchasePrice:['Induló száraz tűzifa beszerzési ára','Ft/tömör m³',0,1e7],
};
export function defaultWoodProfile(){return {annualNeed:6,annualIncrement:4,usablePct:85,rotationYears:20,yearsToFirstHarvest:20,dryingYears:2,reserveYears:1,stackFactor:1.6,stackHeight:1.5,storageSetup:10000,processingCost:6000,processingHours:8,purchasePrice:45000,standStatus:'new',storageProvided:false,startingStockOwned:false};}
export function woodRequirement(plan,item,c){if(item.id!=='firewood')return null;const p=plan.wood,self=item.quantityMode==='self';const target=self?p.annualNeed*item.selfTargetPct/100:0,usablePerUnit=p.annualIncrement*p.usablePct/100/10000*c.area;return {target,rawUnits:target/usablePerUnit,usablePerUnit,self};}
export function woodAtArea(p,growingArea){
 const production=growingArea/10000*p.annualIncrement*p.usablePct/100;
 const stock=production*(p.dryingYears+p.reserveYears);
 const storageArea=p.storageProvided?0:stock*p.stackFactor/p.stackHeight;
 const waitYears=(p.standStatus==='new'?p.yearsToFirstHarvest:0)+p.dryingYears;
 const batchVolume=production*p.rotationYears;
 return {growingArea,production,stock,storageArea,storageSetup:storageArea*p.storageSetup,stockPurchase:p.startingStockOwned?0:stock*p.purchasePrice,processingMonthly:production*p.processingCost/12,processingMonthlyHours:production*p.processingHours/12,annualCutArea:growingArea/p.rotationYears,batchVolume,batchHours:batchVolume*p.processingHours,harvestPeakHours:production*p.processingHours*(p.standStatus==='new'?p.rotationYears:1),waitYears,bridgeAnnualCost:production*p.purchasePrice,bridgeVolume:production*waitYears,bridgeTotalCost:production*waitYears*p.purchasePrice};
}
export function mergeWood(row,refs){
 const woods=refs.filter(x=>x.wood&&x.qty>0);if(!woods.length)return;
 row.wood=Object.fromEntries(['production','stock','storageArea','annualCutArea','batchVolume','batchHours','bridgeAnnualCost','bridgeVolume','bridgeTotalCost'].map(k=>[k,row.qty*(k==='production'?Math.min:Math.max)(...woods.map(x=>x.wood[k]/x.qty))]));
 row.wood.storageArea=Math.min(row.area,row.wood.storageArea);row.wood.growingArea=row.area-row.wood.storageArea;
 row.wood.waitYears=Math.max(...woods.map(x=>x.wood.waitYears));
}
export function woodSummary(plans,results,merged=[]){
 const entries=results.flatMap((r,i)=>r.rows.filter(x=>x.wood).map(row=>({row,index:i})));
 if(!entries.length)return null;
 const ids=new Set(merged.map(x=>x.id)),effective=[...entries.map(x=>x.row).filter(x=>!ids.has(x.id)),...merged.filter(x=>x.wood)];
 const sum=k=>effective.reduce((s,r)=>s+(r.wood[k]||0),0);
 const demand=entries.reduce((s,x)=>s+plans[x.index].wood.annualNeed,0),target=entries.reduce((s,x)=>s+x.row.wood.target,0),production=sum('production');
 return {demand,target,production,coverage:demand?Math.min(100,production/demand*100):0,shortage:Math.max(0,target-production),surplus:Math.max(0,production-demand),growingArea:sum('growingArea'),storageArea:sum('storageArea'),stock:sum('stock'),waiting:effective.some(x=>x.qty>0&&x.wood.waitYears>0),maxWait:Math.max(0,...effective.filter(x=>x.qty>0).map(x=>x.wood.waitYears)),bridgeAnnualCost:sum('bridgeAnnualCost'),bridgeTotalCost:sum('bridgeTotalCost')};
}
