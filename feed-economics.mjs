import {defaultPlan} from './data.mjs?v=20261013-8';
import {calculate} from './model.mjs?v=20261013-8';
import {FOOD_PRODUCERS} from './food.mjs?v=20261013-8';
export const MNB_BENCHMARK={rate:5.5,effective:'2026-08-26',confirmation:'2026-09-22',collected:'2026-10-13',status:'Beküldött, a felhasználó által ellenőrzött adat; itt önállóan nem ellenőrzött.',url:'https://www.mnb.hu/letoltes/hu-sajtotajekoztato-a-monetaris-tanacs-2026-szeptember-22-i-dontese-utan.pdf'};
export const LAND_BENCHMARK={perHa:2400000,year:2024,rounded:true,collected:'2026-10-13',status:'Felhasználó által a KSH-kiadványban ellenőrzött, beküldött érték; itt önállóan nem ellenőrzött.',url:'https://www.ksh.hu/s/kiadvanyok/termofoldarak-es-berleti-dijak-2024/index.html'};
export function economicsDefaults(animal='hen') {
 const p=defaultPlan(),c=p.catalogue.find(x=>x.id===animal),food=FOOD_PRODUCERS[animal];
 if(!['hen','cowmilk'].includes(animal))throw new Error('Ismeretlen összehasonlítás.');
 const quantity=animal==='hen'?10:1;
 return {animal,quantity,need:quantity*food.annualYield*food.usablePct/100,productPrice:animal==='hen'?90:400,
  feedPerDay:c.feed,feedPrice:c.feedPrice,yield:animal==='hen'?p.assumptions.grainYield:p.assumptions.forageYield,
  landPrice:LAND_BENCHMARK.perHa/10000,rate:MNB_BENCHMARK.rate,labourPrice:3000,lifetime:10,purchasePct:5,
  animalSetup:c.setup,animalMonthly:c.monthly,animalHours:c.hours,
  fieldSetup:p.assumptions.autoFeedSetup,fieldAnnual:p.assumptions.autoFeedMonthly*12,fieldAnnualHours:p.assumptions.autoFeedHours*12,
  annualYield:food.annualYield,usablePct:food.usablePct};
}
export function feedEconomics(v) {
 for(const [key,n] of Object.entries(v))if(key!=='animal'&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e12))throw new Error('Hibás összehasonlító bemenet.');
 if(!Number.isInteger(v.quantity)||v.quantity>10000||v.yield<=0||v.lifetime<=0||v.rate>100||v.purchasePct>100||v.usablePct>100)throw new Error('Érvénytelen mennyiség, arány vagy hozam.');
 const p=defaultPlan(),c=p.catalogue.find(x=>x.id===v.animal);
 if(!['hen','cowmilk'].includes(v.animal))throw new Error('Ismeretlen összehasonlítás.');
 Object.assign(c,{feed:v.feedPerDay,feedPrice:v.feedPrice,setup:v.animalSetup,monthly:v.animalMonthly,hours:v.animalHours});
 Object.assign(p.assumptions,{autoFeedSetup:v.fieldSetup,autoFeedMonthly:v.fieldAnnual/12,autoFeedHours:v.fieldAnnualHours/12,grainYield:v.yield,forageYield:v.yield});
 p.items=[{id:v.animal,min:v.quantity,wish:v.quantity,locked:true,scope:'family',owned:false}];
 p.preferences.feedFlexible=false;p.preferences.irrigation=false;p.preferences.machinery=false;
 const production=v.quantity*v.annualYield*v.usablePct/100,shortfall=Math.max(0,v.need-production),surplus=Math.max(0,production-v.need);
 const scenarios=[100,0].map(share=>{
  p.assumptions.feedShare=share;
  const r=calculate(p),row=r.rows[0],land=row.area*v.landPrice,fees=land*v.purchasePct/100;
  const capex=row.setup,capital=land+fees+capex,cash=row.monthly*12+shortfall*v.productPrice;
  const hours=row.hours*12,labour=hours*v.labourPrice,interest=capital*v.rate/100,renewal=capex/v.lifetime;
  return {id:share?'own':'bought',land:row.area,feedLand:row.autoArea,landCost:land,fees,capex,capital,feedPurchase:row.feedKg*(1-share/100)*v.feedPrice,fieldOpex:row.autoMonthly*12,animalOpex:v.quantity*v.animalMonthly*12,foodPurchase:shortfall*v.productPrice,cash,hours,labour,interest,renewal,economic:cash+labour+interest+renewal,production,surplus,shortfall};
 });
 scenarios.push({id:'none',land:0,feedLand:0,landCost:0,fees:0,capex:0,capital:0,feedPurchase:0,fieldOpex:0,animalOpex:0,foodPurchase:v.need*v.productPrice,cash:v.need*v.productPrice,hours:0,labour:0,interest:0,renewal:0,economic:v.need*v.productPrice,production:0,surplus:0,shortfall:v.need});
 const [own,bought]=scenarios,feedKg=v.quantity*v.feedPerDay*365;
 const threshold=feedKg?(own.fieldOpex+(own.labour-bought.labour)+(own.interest-bought.interest)+(own.renewal-bought.renewal))/feedKg:null;
 return {scenarios,feedKg,production,need:v.need,surplus,shortfall,threshold};
}

// An actual parcel is purchased as a whole, regardless of the fraction in production.
export function parcelEconomics(v,{price,area,commonArea=1500,fixedPurchase=250000,annualUpkeep=0,usableFeedArea=null}) {
 for(const n of [price,area,commonArea,fixedPurchase,annualUpkeep])if(!Number.isFinite(n)||n<0||n>1e12)throw new Error('Hibás teljesingatlan-adat.');
 if(price<=0||area<=0||usableFeedArea!==null&&(!Number.isFinite(usableFeedArea)||usableFeedArea<0||usableFeedArea>area))throw new Error('Hiányzó vagy hibás ingatlanméret / irányár.');
 const result=feedEconomics(v);
 result.scenarios=result.scenarios.map(s=>{
  const fees=price*v.purchasePct/100+fixedPurchase,capital=price+fees+s.capex,interest=capital*v.rate/100;
  const requiredArea=s.land+commonArea,cash=s.cash+annualUpkeep;
  return {...s,purchasedArea:area,requiredArea,fitsTotal:requiredArea<=area,fitsFeed:usableFeedArea===null?null:s.feedLand<=usableFeedArea,
   landCost:price,fees,capital,interest,cash,economic:cash+s.labour+interest+s.renewal};
 });
 const [own,bought]=result.scenarios;
 result.threshold=result.feedKg?(own.fieldOpex+(own.labour-bought.labour)+(own.interest-bought.interest)+(own.renewal-bought.renewal))/result.feedKg:null;
 return result;
}
