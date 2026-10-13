// Read-only explanations of calculated values; never changes a saved plan.
export function costDetails(plan,result){
 const r=result,a=plan.assumptions,ci=r.calculationInputs;
 const line=(id,label,value,formula,source)=>({id,label,value,formula,source});
 const design=[line('design','Tervezési keret',r.design,{base:ci.houseBase,pct:a.designPct},'assumptions.designPct')];
 const farm=r.rows.flatMap(row=>{
  const c=plan.catalogue.find(c=>c.id===row.id),item=plan.items.find(i=>i.id===row.id);
  const wood=row.wood,base=Math.max(0,row.setup-row.autoSetup-(wood?.storageSetup||0)-(wood?.stockPurchase||0));
  return [line(`${row.id}-setup`,`${row.name} · beszerzés / telepítés`,base,{qty:row.qty,unit:row.unit,rate:c.setup,omitted:item.owned||wood&&plan.wood.standStatus==='existing'},`catalogue.${row.id}.setup`),
   ...(row.autoArea>0?[line(`${row.id}-feed-setup`,`${row.name} · további takarmányföld indítása`,row.autoSetup,{qty:row.autoArea,unit:'m²',rate:a.autoFeedSetup},'assumptions.autoFeedSetup')]:[]),
   ...(wood?[line('wood-storage','Tűzifakészlet tárolójának kialakítása',wood.storageSetup,{qty:wood.storageArea,unit:'m²',rate:plan.wood.storageSetup},'wood.storageSetup'),line('wood-stock','Induló száraz tűzifakészlet',wood.stockPurchase,{qty:wood.stock,unit:'tömör m³',rate:plan.wood.purchasePrice,omitted:plan.wood.startingStockOwned},'wood.purchasePrice')]:[])];
 });
 const infrastructure=[...r.serviceRows.map(row=>{
  const service=row.id.startsWith('service-'),id=row.id.replace('service-','');
  const paths={'equipment-tools':'site.tools','equipment-machinery':'assumptions.machinerySetup','site-fence':'site.fence','site-outbuildings':'site.outbuildings'};
  return line(row.id,service?`${row.name} · ${row.optionName}`:row.name,row.setup,service?{manual:true}:row.id==='equipment-machinery'?{base:a.machinerySetup,factor:ci.machineLevel}:{manual:true,omitted:row.id==='equipment-tools'&&plan.site.ownedTools},service?`serviceCatalogue.${id}.options.${row.option}.setup`:paths[row.id]);
 }),line('irrigation','Automata öntözés kialakítása',ci.irrigationCost,{qty:ci.cropArea,unit:'m²',rate:a.irrigationSetup,factor:ci.autoLevel},'assumptions.irrigationSetup'),
 ...[['surveys','Talajvizsgálat, műszaki ellenőr'],['relocation','Költözés'],['otherSetup','Egyéb induló kiadás']].map(([k,label])=>line(k,label,plan.site[k],{manual:true},`site.${k}`))];
 const contingency=[['house','Házépítés',r.house],['design','Tervezés',r.design],['farm','Gazdaság indítása',r.farm],['infrastructure','Infrastruktúra, eszközök',r.infrastructure]].map(([id,label,value])=>line(`contingency-${id}`,`${label} után`,value*a.contingencyPct/100,{base:value,pct:a.contingencyPct},'assumptions.contingencyPct'));
 return {
  Tervezés:{id:'design',total:r.design,lines:design,note:'Ide tervezhetitek az építészeti, statikai és gépészeti / elektromos szakági tervek díját. Jelenleg egy százalékos keretet számolunk az alap építési árra, nem szakágankénti díjajánlatot. A saját építési munka ezt az alapot nem csökkenti. A talajvizsgálat és műszaki ellenőr külön, az infrastruktúránál szerepel.'},
  'Gazdaság indítása':{id:'farm',total:r.farm,lines:farm,note:'Beszerzés / telepítés, automatikusan hozzáadott takarmányföld, illetve tűzifánál tároló és induló száraz készlet. A havi fenntartás és munka külön eredmény. A már meglévő beszerzés nem kerül újra levonásra.'},
  'Infrastruktúra, eszközök':{id:'infrastructure',total:r.infrastructure,lines:infrastructure,note:'A kiválasztott közműmegoldások és a megadott teljes keretek. Az öntözés és gépesítés csak az engedélyezett móddal számol. A nulla érték kihagyott vagy nulla költségre beállított tétel; a konkrét ajánlatot külön kell megadni.'},
  'Biztonsági keret':{id:'contingency',total:r.contingency,lines:contingency,note:'Az induló kiadások százalékos tartaléka. Nem külön kivitelezési tétel vagy újabb fizetendő díj; a váratlan kiadásokra félretett pénz. A többhavi működési tartalék ettől külön szerepel.'},
 };
}
export function landAnalysis(map){
 const components=map.groups.flatMap(owner=>owner.zones.map(z=>({...z,key:`${owner.id}:${z.id}`,owner:owner.name,ownerId:owner.id,percent:map.area?z.area/map.area*100:0}))).sort((a,b)=>b.area-a.area);
 const activities=new Map();
 for(const part of components){const base=part.id.endsWith('-feed')?part.id.slice(0,-5):part.id==='firewood-storage'?'firewood':part.id,key=`${part.ownerId}:${base}`;
  if(!activities.has(key)){const main=components.find(x=>x.ownerId===part.ownerId&&x.id===base);activities.set(key,{key,id:base,owner:part.owner,label:main?.label||part.label.replace(/ saját takarmánya$/,''),area:0,parts:[]});}
  const x=activities.get(key);x.area+=part.area;x.parts.push(part);
 }
 return {total:map.area,components,activities:[...activities.values()].map(x=>({...x,percent:map.area?x.area/map.area*100:0})).sort((a,b)=>b.area-a.area)};
}
export function landScenarios(plan,result,minimum,calculate){
 const scenarios=[{id:'minimum',label:'Minimumterv a rögzítések megtartásával',area:minimum.landArea,note:'A kézi minimumokat használja. A rögzített kívánt mennyiségek és önellátási célok maradnak.'}];
 const simulate=(id,label,note,change)=>{const copy=JSON.parse(JSON.stringify(plan));change(copy);scenarios.push({id,label,note,area:calculate(copy).landArea});};
 if(result.rows.some(x=>x.feedKg>0))for(const pct of [0,100])simulate(`feed-${pct}`,`${pct}% saját takarmánnyal`,'Az állatszám és a többi tervérték változatlan. A már kézzel felvett takarmányföld megmarad; a háromszög takarmány-módosítását e próbában kikapcsoljuk.',p=>{p.assumptions.feedShare=pct;p.preferences.feedFlexible=false;});
 for(const row of result.rows.filter(x=>x.food?.self&&x.qty>0).sort((a,b)=>b.area-a.area).slice(0,2))simulate(`yield-${row.id}`,`${row.name} · feleakkora éves hozammal`,'Ugyanaz az éves önellátási cél, kisebb hozam. Állatnál, fánál és bokornál az egészre kerekítés miatt nem mindig változik a darabszám.',p=>p.food.production[row.id].annualYield/=2);
 if(result.rows.some(x=>x.wood?.self&&x.qty>0))simulate('wood-yield','Tűzifa · feleakkora éves fanövedékkel','Ugyanaz a saját faigény. Az éves növedék csökkenése növeli a szükséges termőterületet, a saját éves cél marad.',p=>p.wood.annualIncrement/=2);
 return scenarios.map(s=>({...s,delta:s.area-result.landArea,deltaPct:result.landArea?(s.area/result.landArea-1)*100:0}));
}
export const LAND_COLORS={home:'#b77353',garden:'#c4a36c',greenhouse:'#78a499',orchard:'#6d8c52',berries:'#9caa71',grain:'#c5a156',forage:'#9aaa69',animals:'#a69572',birds:'#c89962',bees:'#d1b875',woodland:'#527b50',storage:'#8c9a83',paths:'#bca985',parking:'#a6ada5',water:'#7baba8',expansion:'#b6c292'};
