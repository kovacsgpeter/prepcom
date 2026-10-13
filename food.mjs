// Provisional planning profiles, not measured Hungarian consumption averages.
// Annual yields are steady-state averages of mature plants or continuously renewed stock.
export const FOOD_PRODUCTS={
  milk:{name:'Ivótej',unit:'liter',annualPerPerson:90,note:'Csak ivótej: sajt, vaj és más tejtermékek alapanyagigénye nincs benne.'},
  eggs:{name:'Tojás',unit:'db',annualPerPerson:200,note:'Felhasználható tojás; a veszteségi hányad külön állítható.'},
  meat:{name:'Hús összesen',unit:'kg',annualPerPerson:40,note:'Felhasználható hús. Több állatfaj céljai ugyanebből az éves családi húsigényből részesednek.'},
  vegetables:{name:'Zöldség összesen',unit:'kg',annualPerPerson:90,note:'Vegyes zöldség éves mennyisége, nem étrendi összetétel vagy tápanyag-ajánlás.'},
  potatoes:{name:'Burgonya',unit:'kg',annualPerPerson:40,note:'Étkezési burgonya külön éves igénye. Ha a saját vegyes zöldségfogyasztásod tartalmazza, vedd ki abból, hogy ne számolj vele kétszer.'},
  sweetcorn:{name:'Csemegekukorica',unit:'kg',annualPerPerson:5,note:'Friss, morzsolt szem tömege, csutka és csuhé nélkül. Ha a vegyes zöldségigényedben is szerepel, onnan vedd ki.'},
  fruit:{name:'Gyümölcs összesen',unit:'kg',annualPerPerson:60,note:'Termő, érett fák és bokrok átlagos éve. Az első évek terméskiesése nincs a mennyiségben.'},
  grain:{name:'Élelmezési gabona',unit:'kg',annualPerPerson:60,note:'Szemtermés-egyenérték, nem kész kenyér vagy liszt. Takarmánygabona külön tétel.'},
  honey:{name:'Méz',unit:'kg',annualPerPerson:1,note:'A méhlegelő és az időjárás miatt a tényleges hozam erősen változhat.'},
};
export const FOOD_PRODUCERS={
  cowmilk:{product:'milk',annualYield:4000,usablePct:80},
  goatmilk:{product:'milk',annualYield:800,usablePct:80},
  hen:{product:'eggs',annualYield:220,usablePct:90},
  broiler:{product:'meat',annualYield:6,usablePct:80},
  duck:{product:'meat',annualYield:6,usablePct:80},
  pig:{product:'meat',annualYield:150,usablePct:80},
  cowmeat:{product:'meat',annualYield:200,usablePct:80},
  goatmeat:{product:'meat',annualYield:20,usablePct:80},
  sheep:{product:'meat',annualYield:25,usablePct:80},
  garden:{product:'vegetables',annualYield:3,usablePct:80},
  potato:{product:'potatoes',annualYield:2.5,usablePct:85},
  sweetcorn:{product:'sweetcorn',annualYield:.8,usablePct:90},
  maize:{product:'grain',annualYield:.7,usablePct:90},
  greenhouse:{product:'vegetables',annualYield:12,usablePct:80},
  apple:{product:'fruit',annualYield:20,usablePct:80},
  peach:{product:'fruit',annualYield:15,usablePct:80},
  apricot:{product:'fruit',annualYield:20,usablePct:80},
  plum:{product:'fruit',annualYield:25,usablePct:80},
  currant:{product:'fruit',annualYield:3,usablePct:80},
  raspberry:{product:'fruit',annualYield:1,usablePct:80},
  wheat:{product:'grain',annualYield:.45,usablePct:90},
  barley:{product:'grain',annualYield:.45,usablePct:90},
  bees:{product:'honey',annualYield:20,usablePct:80},
};
export function defaultFoodProfile(){return {
  profileVersion:2,
  consumption:Object.fromEntries(Object.entries(FOOD_PRODUCTS).map(([id,p])=>[id,{mode:'estimated',annualPerPerson:p.annualPerPerson,annualHousehold:0}])),
  production:Object.fromEntries(Object.entries(FOOD_PRODUCERS).map(([id,p])=>[id,{annualYield:p.annualYield,usablePct:p.usablePct}])),
};}
export function householdDemand(plan,product){const c=plan.food.consumption[product];return c.mode==='manual'?c.annualHousehold:(plan.family.adults+plan.family.children)*c.annualPerPerson;}
export function foodRequirement(plan,item){
  const producer=FOOD_PRODUCERS[item.id];if(!producer)return null;
  const product=FOOD_PRODUCTS[producer.product],profile=plan.food.production[item.id],demand=householdDemand(plan,producer.product);
  const usableYield=profile.annualYield*profile.usablePct/100;
  const targetPct=(item.quantityMode||'manual')==='self'?item.selfTargetPct:0;
  const target=demand*targetPct/100;
  return {product:producer.product,name:product.name,unit:product.unit,demand,targetPct,target,usableYield,rawUnits:target/usableYield,annualYield:profile.annualYield,usablePct:profile.usablePct};
}
export function foodSummary(plans,results,merged=[]){
  const mergedIds=new Set(merged.map(x=>x.id)),map=new Map();
  function record(product){if(!map.has(product))map.set(product,{product,name:FOOD_PRODUCTS[product].name,unit:FOOD_PRODUCTS[product].unit,demand:plans.reduce((s,p)=>s+householdDemand(p,product),0),target:0,production:0,hasGoal:false});return map.get(product);}
  results.forEach(r=>r.rows.filter(x=>x.food).forEach(row=>{const x=record(row.food.product);x.target+=row.food.target;x.hasGoal ||= row.food.self;if(!mergedIds.has(row.id))x.production+=row.food.production;}));
  for(const row of merged){const refs=results.flatMap(r=>r.rows.filter(x=>x.id===row.id&&x.food));if(!refs.length)continue;const x=record(refs[0].food.product);x.production+=row.qty*Math.min(...refs.map(ref=>ref.food.usableYield));}
  return [...map.values()].map(x=>({...x,coverage:x.demand?Math.min(100,x.production/x.demand*100):0,shortage:Math.max(0,x.target-x.production),aboveTarget:Math.max(0,x.production-x.target),surplus:Math.max(0,x.production-x.demand),overlappingGoals:x.target>x.demand+1e-6}));
}
