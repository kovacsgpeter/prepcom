import test from 'node:test';
import assert from 'node:assert/strict';
import {economicsDefaults,feedEconomics,MNB_BENCHMARK} from '../feed-economics.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('same food target in all cases; own land, upfront and operating costs reproduce equations',()=>{const v=economicsDefaults(),r=feedEconomics(v),[own,bought,none]=r.scenarios;close(r.feedKg,456.25);close(r.production,1980);close(own.feedLand,456.25/.45);close(own.capex,220000+45625);close(own.capital,own.landCost+own.fees+own.capex);close(own.cash,42000+60833.33333333333);close(bought.cash,42000+82125);close(own.hours,42+18.25);close(none.cash,1980*90);close(none.land,0);});
test('capital includes extra land and fees; interest changes no cash operating cost',()=>{const v=economicsDefaults(),a=feedEconomics(v).scenarios;v.landPrice*=2;const b=feedEconomics(v).scenarios;for(let i=0;i<2;i++){close(b[i].capital-a[i].capital,a[i].landCost+a[i].fees);close(b[i].interest-a[i].interest,(a[i].landCost+a[i].fees)*v.rate/100);close(b[i].cash,a[i].cash);}v.rate=0;for(const x of feedEconomics(v).scenarios)close(x.interest,0);assert.equal(MNB_BENCHMARK.rate,5.5);});
test('shortfalls are bought in animal cases; surplus never invents revenue',()=>{const v=economicsDefaults();v.need=3000;const r=feedEconomics(v);close(r.shortfall,1020);close(r.scenarios[0].foodPurchase,1020*90);v.need=100;const small=feedEconomics(v);close(small.surplus,1880);close(small.scenarios[0].foodPurchase,0);close(small.scenarios[0].cash,r.scenarios[0].cash-1020*90);});
test('time valuation and equipment renewal are once; break-even threshold closes the cost difference',()=>{const v=economicsDefaults(),a=feedEconomics(v);for(const s of a.scenarios)close(s.economic,s.cash+s.labour+s.interest+s.renewal);v.feedPrice=a.threshold;const b=feedEconomics(v);close(b.scenarios[0].economic,b.scenarios[1].economic);v.labourPrice=0;const c=feedEconomics(v);close(c.scenarios[0].cash,b.scenarios[0].cash);close(c.scenarios[0].labour,0);});
test('cow example uses dry matter, zero stock valid, invalid parameters rejected',()=>{const v=economicsDefaults('cowmilk'),r=feedEconomics(v);close(r.feedKg,5110);close(r.production,3200);close(r.scenarios[0].feedLand,5110/.45);v.quantity=0;const zero=feedEconomics(v);close(zero.scenarios[0].land,0);close(zero.scenarios[0].cash,zero.scenarios[2].cash);assert.equal(zero.threshold,null);for(const patch of [{quantity:.5},{yield:0},{rate:101},{landPrice:-1},{lifetime:0},{need:NaN},{animal:'sheep'}])assert.throws(()=>feedEconomics({...economicsDefaults(),...patch}));});

test('property references have exact supplied links and unknown prices stay unknown',async()=>{const {PROPERTY_REFERENCES,propertyUnitPrice}=await import('../property-references.mjs');assert.deepEqual(PROPERTY_REFERENCES.map(x=>x.url),['https://ingatlan.com/35589984','https://ingatlan.com/35567099','https://ingatlan.com/35570089']);assert.equal(propertyUnitPrice(null,1000),null);assert.equal(propertyUnitPrice(1000000,0),null);close(propertyUnitPrice(10000000,20000),500);assert.equal(PROPERTY_REFERENCES[0].areaApprox,true);close(propertyUnitPrice(PROPERTY_REFERENCES[0].price,PROPERTY_REFERENCES[0].area),475);});

test('whole estate is bought in every lifestyle; low unit price never discounts the asking price',async()=>{
 const {parcelEconomics}=await import('../feed-economics.mjs');const v=economicsDefaults(),p={price:95000000,area:200000};
 const r=parcelEconomics(v,p);
 for(const s of r.scenarios){close(s.landCost,95000000);close(s.purchasedArea,200000);close(s.fees,5000000);close(s.capital,100000000+s.capex);close(s.interest,s.capital*.055);}
 close(r.scenarios[2].capital,100000000);close(r.scenarios[0].capital-r.scenarios[1].capital,45625);
 v.landPrice=1;const changed=parcelEconomics(v,p);assert.deepEqual(changed,r);
 const smaller=parcelEconomics(economicsDefaults(),{price:36000000,area:20368});assert.ok(smaller.scenarios[0].capital<r.scenarios[0].capital);
});
test('whole parcels flag insufficient total or usable land; maintenance applies to all variants once',async()=>{
 const {parcelEconomics}=await import('../feed-economics.mjs');const v=economicsDefaults('cowmilk'),base=parcelEconomics(v,{price:40000000,area:11541,usableFeedArea:7063});
 assert.equal(base.scenarios[0].fitsTotal,false);assert.equal(base.scenarios[0].fitsFeed,false);assert.equal(base.scenarios[1].fitsTotal,true);assert.equal(base.scenarios[1].fitsFeed,true);
 const upkeep=parcelEconomics(v,{price:40000000,area:11541,usableFeedArea:7063,annualUpkeep:120000});
 for(let i=0;i<3;i++){close(upkeep.scenarios[i].cash-base.scenarios[i].cash,120000);close(upkeep.scenarios[i].economic-base.scenarios[i].economic,120000);close(upkeep.scenarios[i].capital,base.scenarios[i].capital);}
 const unknown=parcelEconomics(v,{price:95000000,area:200000});assert.equal(unknown.scenarios[0].fitsFeed,null);
 assert.throws(()=>parcelEconomics(v,{price:0,area:1000}));assert.throws(()=>parcelEconomics(v,{price:1000,area:100,usableFeedArea:101}));
});
