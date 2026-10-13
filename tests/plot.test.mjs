import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPlan} from '../data.mjs';
import {calculate,aggregate} from '../model.mjs';
import {familyMapData,groupMapData,partitionRectangles,renderEstateMap} from '../plot.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} ≠ ${b}`);
const areaOf=data=>data.groups.flatMap(g=>g.zones).reduce((s,z)=>s+z.area,0);
test('family map includes all calculated land exactly once',()=>{
  const p=defaultPlan();p.assumptions.feedShare=100;p.items.push({id:'greenhouse',min:30,wish:40,locked:true,scope:'family',owned:false});const r=calculate(p),map=familyMapData(p,r);
  close(areaOf(map),r.landArea);assert.ok(map.groups[0].zones.some(z=>z.type==='greenhouse'));assert.ok(map.groups[0].zones.some(z=>z.id==='hen-feed'));assert.ok(map.groups[0].zones.some(z=>z.type==='orchard'));
});
test('group map deduplicates shared shed land and reflects corrected common feed credits',()=>{
  const p=defaultPlan();p.assumptions.feedShare=100;p.site.outbuildingsScope='shared';p.items.push({id:'feedgrain',min:100,wish:100,locked:true,scope:'shared',owned:false});const q=structuredClone(p);q.family.name='Második család';
  const g=aggregate([p,q],{decisions:{'site-outbuildings':{strategy:'shared',minimum:1,quantity:1},feedgrain:{strategy:'shared',minimum:100,quantity:100}}});const map=groupMapData([p,q],g);
  close(areaOf(map),g.landArea);assert.equal(map.groups.length,3);assert.equal(map.groups.at(-1).name,'Közös használat');assert.equal(map.groups.flatMap(x=>x.zones).filter(z=>z.type==='storage').length,1);
  map.groups.forEach(owner=>close(owner.zones.reduce((s,z)=>s+z.area,0),owner.area));
});
test('nested layout preserves zone identity, area proportions and nonoverlapping rectangles',()=>{
  const items=[{id:'a',area:90},{id:'b',area:35},{id:'c',area:15},{id:'d',area:.1}];const rect={x:10,y:20,w:900,h:580,area:140.1,id:'owner',name:'Család'};const layout=partitionRectangles(items,rect);
  close(layout.reduce((s,r)=>s+r.w*r.h,0),900*580);
  for(const box of layout){assert.notEqual(box.id,'owner');close(box.area,items.find(x=>x.id===box.id).area);close(box.w*box.h/(900*580),box.area/140.1);assert.ok(box.x>=10-1e-6&&box.y>=20-1e-6&&box.x+box.w<=910+1e-6&&box.y+box.h<=600+1e-6);}
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){const a=layout[i],b=layout[j],overlapW=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),overlapH=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));close(overlapW*overlapH,0);}
});
test('map labels are escaped, symbols have local references, and empty plans are safe',()=>{
  const p=defaultPlan();p.family.name='<img src=x onerror=alert(1)>';const html=renderEstateMap(familyMapData(p,calculate(p)),{id:'test-map'});assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('test-map-greenhouse'));assert.ok(html.includes('role="button"'));assert.ok(renderEstateMap({area:0,groups:[]}).includes('Még nincs ábrázolható terület'));
});
test('a one-family reveal links to its community snapshot rather than the editable family',()=>{
  const p=defaultPlan(),g=aggregate([p]);const html=renderEstateMap(groupMapData([p],g));assert.ok(html.includes('view=current-community'));
});
