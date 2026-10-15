// Symbolic, area-proportional parcel illustration. No cadastral or siting claims.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=1)=>new Intl.NumberFormat('hu-HU',{maximumFractionDigits:d}).format(n);
const total=items=>items.reduce((s,x)=>s+x.area,0);
export const PALETTE=['#bf7853','#567e62','#668caa','#a987b6','#b6a142','#ca6e89','#4c9793','#7d77bc'];
export function ownerColor(i){return PALETTE[i]||`hsl(${i*137.5%360} 45% 44%)`;}
const TYPES={
  home:{fill:'#ead9ba',pattern:'courtyard',icon:'house',title:'Otthon és udvar'},
  garden:{fill:'#d6bb92',pattern:'beds',icon:'garden',title:'Konyhakert'},
  greenhouse:{fill:'#d4e7dc',pattern:'glass',icon:'greenhouse',title:'Fólia / üvegház'},
  woodland:{fill:'#a8c29b',pattern:'leaves',icon:'timber-tree',title:'Tűzifa-termő terület'},
  orchard:{fill:'#c4d2a2',pattern:'leaves',icon:'tree',title:'Gyümölcsös'},
  berries:{fill:'#d4d7b4',pattern:'berries',icon:'bush',title:'Bogyósok'},
  grain:{fill:'#e2cea1',pattern:'grain',icon:'wheat',title:'Gabona'},
  forage:{fill:'#bccb9a',pattern:'grass',icon:'forage',title:'Takarmányterület'},
  animals:{fill:'#ddcfad',pattern:'pasture',icon:'goat',title:'Állattartás'},
  birds:{fill:'#e4d2af',pattern:'pasture',icon:'hen',title:'Baromfi'},
  bees:{fill:'#e6d9a3',pattern:'flowers',icon:'hive',title:'Méhészet'},
  storage:{fill:'#d3d5bc',pattern:'courtyard',icon:'shed',title:'Tároló / műhely'},
  paths:{fill:'#e9ddc2',pattern:'gravel',icon:'road',title:'Utak és közlekedés'},
  parking:{fill:'#d6d8ce',pattern:'gravel',icon:'car',title:'Parkolás'},
  water:{fill:'#d5e0d5',pattern:'courtyard',icon:'water',title:'Szennyvízkezelés helye'},
  unplanned:{fill:'#e5e2d5',pattern:'gravel',icon:'open-land',title:'Hasznosításra nem tervezett terület'},
  excluded:{fill:'#cfd5d2',pattern:'courtyard',icon:'open-land',title:'A tervezésből kizárt terület'},
  expansion:{fill:'#d8dec0',pattern:'grass',icon:'future',title:'Bővítési tartalék'},
};
function activityType(id,category){if(id==='firewood')return 'woodland';if(id==='garden'||id==='greenhouse')return id;if(['apple','peach','plum'].includes(id))return 'orchard';if(['currant','raspberry'].includes(id))return 'berries';if(['hen','broiler','duck'].includes(id))return 'birds';if(id==='bees')return 'bees';if(['wheat','barley','feedgrain','maize','feedmaize','sweetcorn'].includes(id))return 'grain';if(['forage','pasture'].includes(id))return 'forage';return category==='Gyümölcsös'?'orchard':category==='Növények'?'garden':'animals';}
function activityIcon(id,type){return id.startsWith('cow')?'cow':id==='pig'?'pig':id==='sheep'?'sheep':id==='duck'?'duck':TYPES[type].icon;}
function add(zones,id,label,area,type,note='',qty=1,icon=TYPES[type].icon){if(area>0)zones.push({id,label,area,type,note,qty,icon});}
function activityZones(rows){const zones=[];for(const row of rows){const type=activityType(row.id,row.category),auto=row.autoArea||0;if(row.wood){add(zones,row.id,row.name,row.wood.growingArea,'woodland',`${fmt(row.qty)} m² termőterület · ${fmt(row.wood.production)} tömör m³/év`,row.qty);add(zones,`${row.id}-storage`,'Tűzifakészlet tárolója',row.wood.storageArea,'storage',`${fmt(row.wood.stock)} tömör m³ száradó és száraz készlet`);continue;}add(zones,row.id,row.name,Math.max(0,row.area-auto),type,`${fmt(row.qty)} ${row.unit}`,row.qty,activityIcon(row.id,type));if(auto>0)add(zones,`${row.id}-feed`,`${row.name} saját takarmánya`,auto,row.feedKind==='grain'?'grain':'forage','További, a modell által számolt takarmányterület');}return zones;}
function familyZones(f){const zones=[];add(zones,'home','Otthon és udvar',f.homeLand,'home',`Ház: ${fmt(f.homeArea)} m²; a zóna az udvart is tartalmazza`);zones.push(...activityZones(f.items));for(const [field,type] of [['storage','storage'],['paths','paths'],['parking','parking'],['wastewater','water'],['expansion','expansion']])add(zones,field,TYPES[type].title,f.site[field],type);return zones;}
export function familyMapData(plan,result){const f={name:plan.family.name,homeLand:result.homeLand,homeArea:result.homeArea,site:plan.site,items:result.rows};return {groups:[{id:'family-0',name:f.name,color:ownerColor(0),zones:familyZones(f),area:result.landArea}],area:result.landArea,commonEquipment:[],preliminary:false,community:false};}
export function groupMapData(plans,group){
  const groups=group.plotFamilies.map((f,i)=>({id:`family-${i}`,name:f.name,color:ownerColor(i),zones:familyZones(f),area:f.totalArea}));
  const common=[];
  for(const row of group.merged){if(row.id==='site-outbuildings')add(common,row.id,row.name,row.area,'storage',`${fmt(row.qty)} közös rendszer`,row.qty);else if(row.area>0)common.push(...activityZones([row]));}
  if(common.length)groups.push({id:'common',name:'Közös használat',color:'#7b875e',zones:common,area:total(common)});
  return {groups,area:group.landArea,commonEquipment:group.merged.filter(x=>x.area===0&&x.qty>0).map(x=>({name:x.name,qty:x.qty})),preliminary:group.unresolved>0,community:true};
}

// Balanced binary treemap: all regions cover the frame, and area ratios remain exact.
export function partitionRectangles(items,rect={x:0,y:0,w:900,h:580}){
  const usable=items.filter(x=>Number.isFinite(x.area)&&x.area>0).map((item,index)=>({...item,_order:index}));
  const out=[];
  function split(list,r){if(!list.length)return;if(list.length===1){const {_order,...item}=list[0];out.push({...item,...r});return;}
    const sum=total(list);let running=0,best=1,distance=Infinity;
    for(let i=1;i<list.length;i++){running+=list[i-1].area;const diff=Math.abs(sum/2-running);if(diff<distance){distance=diff;best=i;}}
    const a=list.slice(0,best),b=list.slice(best),ratio=total(a)/sum;
    if(r.w>=r.h){split(a,{...r,w:r.w*ratio});split(b,{...r,x:r.x+r.w*ratio,w:r.w*(1-ratio)});}else{split(a,{...r,h:r.h*ratio});split(b,{...r,y:r.y+r.h*ratio,h:r.h*(1-ratio)});}
  }
  split(usable.sort((a,b)=>b.area-a.area||a._order-b._order),{x:rect.x,y:rect.y,w:rect.w,h:rect.h});return out;
}

function symbols(prefix){const symbol=(id,body)=>`<symbol id="${prefix}-${id}" viewBox="0 0 64 64">${body}</symbol>`;
  const goat='<ellipse cx="29" cy="33" rx="20" ry="12" fill="#e8dec4"/><path d="M15 40v16m14-14v14m12-16v16" stroke="#776c50" stroke-width="4"/><path d="M42 22l4-12 4 12m-2-6 8-4" stroke="#7c7053" stroke-width="3" fill="none"/><path d="M43 21q15-5 13 9l-8 10-9-9Z" fill="#e6d5b8"/><circle cx="50" cy="26" r="2" fill="#4a4839"/>';
  const hen='<path d="M12 38 4 27l12 3" fill="#9f8c61"/><ellipse cx="29" cy="38" rx="20" ry="14" fill="#fff4d9"/><circle cx="46" cy="26" r="9" fill="#fff4d9"/><path d="M42 18v-5l4 3 4-4 2 7" fill="#bc6850"/><path d="M53 25l9 4-9 3" fill="#d7a34a"/><circle cx="49" cy="24" r="1.8" fill="#414e36"/><path d="M24 48v9m13-8v8m-18 0h10m3 0h10" stroke="#a98349" stroke-width="2.5"/><path d="M19 35q14-9 19 4" stroke="#d4c9a1" fill="none" stroke-width="2"/>';
  return [
    symbol('house','<ellipse cx="33" cy="57" rx="25" ry="4" fill="#8f936442"/><path d="M13 26v26l23 9V33Z" fill="#efe4c8"/><path d="M36 33v28l18-10V24Z" fill="#ddd0ac"/><path d="M7 26 29 7 60 22 36 38Z" fill="#b87854"/><path d="M7 26 29 7v13L14 32Z" fill="#cb946a"/><path d="M21 37v15l10 4V41Z" fill="#817c63"/><path d="M42 36l7-4v10l-7 4Z" fill="#8aa69b"/>'),
    symbol('greenhouse','<ellipse cx="32" cy="58" rx="28" ry="4" fill="#78948235"/><path d="M7 51V26Q31-3 57 26v25L33 62Z" fill="#d9eee4" fill-opacity=".88" stroke="#77978c" stroke-width="2"/><path d="M7 26 33 37 57 26M33 37V61M19 13l26 12v31M32 9l13 6M7 51l26 11 24-11" fill="none" stroke="#83a99a" stroke-width="1.7"/><path d="M12 38l14 6v8l-14-6Zm27 6 13-6v8l-13 6Z" fill="#84a969"/><path d="M19 20l0 35M45 20v34" stroke="#a8c5b6" stroke-width="1.2"/>'),
    symbol('timber-tree','<ellipse cx="32" cy="58" rx="19" ry="4" fill="#64835a42"/><path d="M32 27v32" stroke="#7b6c4d" stroke-width="5"/><path d="M32 3 12 29h10L7 46h50L42 29h10Z" fill="#567d4e"/><path d="M32 3 20 23h24Z" fill="#739664"/>'),
    symbol('tree','<ellipse cx="32" cy="58" rx="16" ry="4" fill="#82926742"/><path d="M30 27v31m1-13-10-8m10 2 9-9" stroke="#7b7c4f" stroke-width="5" fill="none"/><circle cx="23" cy="26" r="16" fill="#587c4c"/><circle cx="41" cy="26" r="15" fill="#658953"/><circle cx="32" cy="17" r="15" fill="#71955b"/><circle cx="22" cy="29" r="3" fill="#c69158"/><circle cx="41" cy="24" r="3" fill="#c07b4e"/><circle cx="31" cy="14" r="3" fill="#d3a66a"/>'),
    symbol('bush','<ellipse cx="32" cy="49" rx="24" ry="6" fill="#8b9b6340"/><circle cx="18" cy="36" r="13" fill="#728c55"/><circle cx="43" cy="35" r="13" fill="#7e9a5c"/><circle cx="32" cy="27" r="14" fill="#66824f"/><g fill="#8a6681"><circle cx="22" cy="34" r="3"/><circle cx="27" cy="39" r="3"/><circle cx="39" cy="25" r="3"/><circle cx="43" cy="39" r="3"/></g>'),
    symbol('garden','<path d="M4 14 43 4 60 48 19 59Z" fill="#c8a777"/><g stroke="#698b50" stroke-width="7"><path d="M13 17 47 8M16 28 51 19M20 40 55 30M24 52 59 42"/></g><g stroke="#e3c79c" stroke-width="2"><path d="M9 23 51 12M13 35 54 24M17 47 58 36"/></g>'),
    symbol('wheat','<g stroke="#ac9253" stroke-width="2.5" fill="none"><path d="M16 58V10m16 48V5m16 53V13M16 21 8 15m8 17-8-6m8 17-8-6m8-16 8-6m-8 17 8-6m-8 17 8-6M32 15l-8-6m8 17-8-6m8 17-8-6m8-16 8-6m-8 17 8-6m-8 17 8-6M48 23l-8-6m8 17-8-6m8 17-8-6m8-16 8-6m-8 17 8-6m-8 17 8-6"/></g>'),
    symbol('forage','<g fill="none" stroke="#7e985a" stroke-width="4" stroke-linecap="round"><path d="M11 54 8 20m3 34 11-29m0 31-3-23m14 22-4-41m4 41 11-30m1 31-3-23m9 22 5-40"/></g>'),
    symbol('goat',goat),symbol('hen',hen),
    symbol('duck',hen.replaceAll('#fff4d9','#c9ddca').replace('M42 18v-5l4 3 4-4 2 7','M53 25h8v5h-8')),
    symbol('cow','<ellipse cx="28" cy="30" rx="22" ry="14" fill="#f1ead4"/><path d="M13 40v16m14-12v12m14-16v16" stroke="#7f775a" stroke-width="5"/><path d="M8 23q13-12 17 2l-5 11-14-2m26-17 13 5-5 14-10-6" fill="#a58f65"/><path d="M42 21q20-4 15 15l-8 7-8-13Z" fill="#dfd1ac"/><path d="M44 20l-2-8m13 8 5-7" stroke="#776d52" stroke-width="3"/><circle cx="50" cy="26" r="2" fill="#454b38"/>'),
    symbol('sheep','<g fill="#f3eacf"><circle cx="18" cy="32" r="13"/><circle cx="30" cy="26" r="13"/><circle cx="39" cy="33" r="13"/></g><path d="M15 40v14m20-14v14" stroke="#7b7960" stroke-width="4"/><ellipse cx="47" cy="28" rx="9" ry="12" fill="#8e8c74"/><circle cx="50" cy="25" r="2" fill="#303f32"/>'),
    symbol('pig','<ellipse cx="27" cy="32" rx="22" ry="15" fill="#d7a18d"/><path d="M12 42v12m24-12v12" stroke="#b18173" stroke-width="5"/><circle cx="47" cy="30" r="12" fill="#deb09a"/><path d="M43 21l1-9 8 8" fill="#c48e80"/><ellipse cx="53" cy="35" rx="8" ry="6" fill="#c88d7e"/><circle cx="50" cy="25" r="2" fill="#505342"/>'),
    symbol('hive','<path d="M16 23h33v32H16Z" fill="#d5b575"/><path d="M12 21h41v6H12Zm2 17h37v5H14Zm0 13h37v5H14Z" fill="#ab8e57"/><path d="M25 56h16v4H25Z" fill="#676e49"/><ellipse cx="46" cy="11" rx="8" ry="5" fill="#bca047"/><path d="M43 7v8m5-8v8" stroke="#4c5b3a" stroke-width="2"/><ellipse cx="41" cy="5" rx="5" ry="3" fill="#d9e1ce"/><ellipse cx="50" cy="5" rx="5" ry="3" fill="#d9e1ce"/>'),
    symbol('shed','<path d="M12 26v28h43V26" fill="#c6c8ab"/><path d="M6 28 34 9 61 28Z" fill="#7e8d71"/><path d="M22 35h23v20H22Z" fill="#879783"/><path d="M25 38h17m-17 5h17m-17 5h17" stroke="#c2cab4" stroke-width="2"/>'),
    symbol('car','<rect x="15" y="7" width="34" height="51" rx="9" fill="#9baaa1"/><path d="M19 20h26l-2 12H21Zm2 25h22l2 9H19Z" fill="#dbe7df"/><path d="M13 17v11m38-11v11m-38 14v11m38-11v11" stroke="#596d61" stroke-width="4"/>'),
    symbol('road','<path d="M9 61 18 38 14 7h26l3 33 13 21" fill="#d1bc95"/><path d="M26 10 30 39l13 20" stroke="#f4ebd8" stroke-width="3" stroke-dasharray="5 4" fill="none"/>'),
    symbol('water','<ellipse cx="32" cy="17" rx="22" ry="8" fill="#96b1a5"/><path d="M10 17v28q22 17 44 0V17" fill="#b5ccc0"/><ellipse cx="32" cy="45" rx="22" ry="8" fill="#95b6a7"/><path d="M32 13v28m-7-6 7 7 7-7" stroke="#eff2df" stroke-width="3" fill="none"/>'),
    symbol('open-land','<path d="M5 18 44 6 60 46 20 59Z" fill="#dedccc" stroke="#969b86" stroke-width="2" stroke-dasharray="5 4"/><path d="m20 36 3-8 3 7m12 10 3-9 3 8" fill="none" stroke="#a7ad8e" stroke-width="2"/>'),
    symbol('future','<path d="M8 55h48" stroke="#a4b57e" stroke-width="4" stroke-dasharray="5 4"/><path d="M25 52V12" stroke="#8c956d" stroke-width="3"/><path d="M26 12h26l-8 9 8 9H26Z" fill="#becd96"/>'),
  ].join('');
}
function patterns(prefix){return ['beds','grain','grass','pasture','gravel','glass','courtyard','leaves','berries','flowers'].map((type,i)=>`<pattern id="${prefix}-pattern-${type}" width="${type==='beds'?22:28}" height="28" patternUnits="userSpaceOnUse"><path d="${type==='beds'?'M0 8H22M0 20H22':type==='grain'?'M0 28 28 0':type==='glass'?'M0 0H28V28H0Z':'M5 9l3-3m11 12 3-3'}" fill="none" stroke="${['#8da66f','#b89c62','#8ba268','#baa780','#bfb59c','#a2bfb2','#cfc3a4','#86a56b','#a2af7d','#afab69'][i]}" stroke-width="${type==='beds'?5:1.5}" opacity=".4"/></pattern>`).join('');}
function decorations(zone,prefix){const {x,y,w,h,type,qty,icon}=zone,short=Math.min(w,h);if(short<20||w*h<850)return '';
  const repeated=['home','woodland','orchard','berries','garden','grain','forage','animals','birds','bees'].includes(type);
  const size=Math.min(type==='home'||type==='greenhouse'?92:46,Math.max(18,short*.42));
  const cols=Math.max(1,Math.floor((w-16)/(size+12))),rows=Math.max(1,Math.floor((h-44)/(size+12)));
  const count=repeated?Math.min(18,Math.max(1,Math.floor(qty||1)),cols*rows):1;
  const actualCols=Math.min(cols,count),actualRows=Math.ceil(count/actualCols);
  return Array.from({length:count},(_,i)=>{const col=i%actualCols,row=Math.floor(i/actualCols),cx=x+w/2+(col-(actualCols-1)/2)*(size+12),cy=y+h/2+(row-(actualRows-1)/2)*(size+10)-10;return `<use href="#${prefix}-${icon}" x="${cx-size/2}" y="${cy-size/2}" width="${size}" height="${size}" aria-hidden="true"/>`;}).join('');
}

export function renderEstateMap(data,{id='estate',width=900,height=580,compact=false,previewLink=true}={}){
  const prefix=id.replace(/[^a-zA-Z0-9-]/g,'');
  if(!data.area||!data.groups.some(g=>g.area>0))return '<div class="estate-empty">Még nincs ábrázolható terület. Adj meg ház-, kert- vagy gazdasági igényt.</div>';
  const owners=partitionRectangles(data.groups,{x:14,y:14,w:width,h:height});
  let index=0;
  const zones=[];
  const outlines=owners.map(owner=>{const placed=partitionRectangles(owner.zones,owner);for(const zone of placed)zones.push({...zone,owner:owner.name,ownerColor:owner.color,number:++index});return `<rect class="estate-owner-frame" x="${owner.x}" y="${owner.y}" width="${owner.w}" height="${owner.h}" fill="none" stroke="${owner.color}" stroke-width="4"/><rect x="${owner.x+3}" y="${owner.y+3}" width="${Math.min(owner.w-6,Math.max(60,owner.name.length*7+24))}" height="23" rx="3" fill="${owner.color}"/><text class="estate-owner-name" x="${owner.x+12}" y="${owner.y+19}">${escape(owner.id==='common'?'Közös':owner.w>140?owner.name.slice(0,25):owner.name.slice(0,10))}</text>`;}).join('');
  return `<div class="estate-map ${compact?'compact':''}" data-map-id="${prefix}"><div class="estate-toolbar"><div><strong>${fmt(data.area)} m²</strong><span>${data.property?(data.property.shortage?' · a kért terület ábrája · nem fér a birtokra':' · a teljes megvett ingatlan'):data.community?' · közös birtok':' · családi terv'}${data.preliminary?' · előzetes összesítés':''}</span></div>${previewLink?`<a class="estate-preview-link" href="plot-preview.html?view=${data.community?'current-community':'current'}" target="_blank" rel="noopener">Nagy előnézet ↗</a>`:''}</div><div class="estate-svg-wrap"><svg class="plot-svg estate-svg" viewBox="0 0 ${width+28} ${height+28}" role="group" aria-label="Felülnézeti, területarányos birtoktérkép"><defs>${symbols(prefix)}${patterns(prefix)}${zones.map(z=>`<clipPath id="${prefix}-clip-${z.number}"><rect x="${z.x+1}" y="${z.y+1}" width="${Math.max(0,z.w-2)}" height="${Math.max(0,z.h-2)}"/></clipPath>`).join('')}</defs><rect x="7" y="7" width="${width+14}" height="${height+14}" rx="9" fill="#e6e6d5"/>${zones.map(z=>`<g class="estate-zone" data-plot-zone="${z.number}" data-label="${escape(z.label)}" data-owner="${escape(z.owner)}" data-area="${z.area}" data-note="${escape(z.note)}" tabindex="0" role="button" aria-label="${escape(z.owner)} · ${escape(z.label)}, ${fmt(z.area)} m²${z.note?`, ${escape(z.note)}`:''}"><title>${escape(z.owner)} · ${escape(z.label)} · ${fmt(z.area)} m²${z.note?` · ${escape(z.note)}`:''}</title><rect class="estate-zone-ground" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${TYPES[z.type].fill}" stroke="#f8f7ed" stroke-width="2"/><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="url(#${prefix}-pattern-${TYPES[z.type].pattern})" pointer-events="none"/><g clip-path="url(#${prefix}-clip-${z.number})" pointer-events="none">${decorations(z,prefix)}${z.w>108&&z.h>76?`<rect x="${z.x+6}" y="${z.y+z.h-39}" width="${z.w-12}" height="33" rx="5" fill="#faf8ec" fill-opacity=".88"/><text class="estate-zone-name" x="${z.x+14}" y="${z.y+z.h-25}">${escape(z.label.length>Math.floor(z.w/7)?z.label.slice(0,Math.max(5,Math.floor(z.w/7)-1))+'…':z.label)}</text><text class="estate-zone-size" x="${z.x+14}" y="${z.y+z.h-12}">${fmt(z.area)} m²</text>`:''}</g>${z.w>23&&z.h>28?`<circle cx="${z.x+14}" cy="${z.y+Math.min(z.h-13,36)}" r="9" fill="#fcfaec" stroke="${z.ownerColor}"/><text class="estate-number" x="${z.x+14}" y="${z.y+Math.min(z.h-13,36)+3}" text-anchor="middle">${z.number}</text>`:''}</g>`).join('')}<g pointer-events="none">${outlines}</g></svg></div><div class="estate-readout" aria-live="polite">Kattints egy zónára vagy a számozott tételre a részletekért.</div><div class="estate-owners">${owners.map(o=>`<span><i style="background:${o.color}"></i>${escape(o.name)} · ${fmt(o.area/data.area*100)}%</span>`).join('')}</div><div class="estate-zone-list">${zones.map(z=>`<button class="estate-legend-item" data-plot-zone="${z.number}" data-label="${escape(z.label)}" data-owner="${escape(z.owner)}" data-area="${z.area}" data-note="${escape(z.note)}"><span class="estate-key" style="border-color:${z.ownerColor}">${z.number}</span><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${prefix}-${z.icon}"/></svg><span>${escape(z.label)}<small>${escape(z.owner)}${z.note?` · ${escape(z.note)}`:''}</small></span><strong>${fmt(z.area)} m²</strong></button>`).join('')}</div>${data.commonEquipment.length?`<p class="estate-footnote">Közös, külön terület nélkül számolt rendszerek: ${data.commonEquipment.map(x=>`${escape(x.name)} (${fmt(x.qty)} db)`).join(', ')}.</p>`:''}<p class="estate-footnote">A zónák területaránya számított. A házak, fák és állatok rajzai jelképesek; a darabszámot a felirat mutatja. A helyek elrendezése illusztráció, nem telepítési vagy beépítési terv.</p></div>`;
}

export function connectEstateMaps(root=document){
  function select(target){const zone=target.closest('[data-plot-zone]');if(!zone)return;const map=zone.closest('.estate-map');if(!map)return;map.querySelectorAll('[data-plot-zone]').forEach(el=>el.classList.toggle('selected',el.dataset.plotZone===zone.dataset.plotZone));map.querySelector('.estate-readout').textContent=`${zone.dataset.owner} · ${zone.dataset.label}: ${fmt(Number(zone.dataset.area))} m²${zone.dataset.note?` · ${zone.dataset.note}`:''}`;}
  root.addEventListener('click',e=>select(e.target));root.addEventListener('keydown',e=>{if(e.target.closest('.estate-zone')&&['Enter',' '].includes(e.key)){e.preventDefault();select(e.target);}});
}
