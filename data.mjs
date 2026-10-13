import {researchSources} from './research.mjs';
import {defaultFoodProfile} from './food.mjs?v=20261013-4';
export const DATA_VERSION = '2026-10-v3-onellatasi-profilok';
export const SOURCES = [
  { title: 'KSH – lakásstatisztika, építési költségek', url: 'https://www.ksh.hu/stadat?theme=lak', status: 'Ellenőrzésre vár. A készítéskor a hálózati hozzáférés blokkolva volt.' },
  { title: 'NAK – mezőgazdasági szakmai tájékoztatók', url: 'https://www.nak.hu/', status: 'További adatkutatáshoz javasolt forrás; a lenti együtthatók nem innen igazolt adatok.' },
  { title: 'Nébih – állattartás és állategészségügy', url: 'https://portal.nebih.gov.hu/', status: 'Tartási, élelmiszerbiztonsági és jogi feltételek ellenőrzéséhez. Nem a modell számainak igazolása.' },
];

// All coefficients are explicitly provisional planning assumptions, not sourced recommendations.
// Area: m²/unit; setup: Ft/unit; monthly: Ft/unit/month excluding purchased feed;
// water: litres/unit/month; hours: hours/unit/month; feed: kg/unit/day, yield: kg/m²/year.
export const CATALOGUE = [
  { id:'garden', category:'Növények', name:'Konyhakert', icon:'🥕', unit:'m²', area:1, setup:900, monthly:35, water:35, hours:.045, peak:2.5, waterPeak:2.8, step:10 },
  { id:'greenhouse', category:'Növények', name:'Fólia / üvegház', icon:'🌱', unit:'m²', area:1.2, setup:18000, monthly:120, water:45, hours:.07, peak:2, waterPeak:2.2, step:5 },
  { id:'wheat', category:'Növények', name:'Búza, étkezési célra', icon:'🌾', unit:'m²', area:1, setup:50, monthly:8, water:0, hours:.0015, peak:4, waterPeak:1, step:100 },
  { id:'barley', category:'Növények', name:'Árpa', icon:'🌾', unit:'m²', area:1, setup:50, monthly:8, water:0, hours:.0015, peak:4, waterPeak:1, step:100 },
  { id:'feedgrain', category:'Növények', name:'Takarmánygabona', icon:'🌾', unit:'m²', area:1, setup:50, monthly:8, water:0, hours:.0015, peak:4, waterPeak:1, step:100, feedYield:.45, feedKind:'grain' },
  { id:'forage', category:'Növények', name:'Szálastakarmány-terület', icon:'☘️', unit:'m²', area:1, setup:35, monthly:5, water:0, hours:.0015, peak:4, waterPeak:1, step:100, feedYield:.45, feedKind:'forage' },
  { id:'apple', category:'Gyümölcsös', name:'Almafa', icon:'🍎', unit:'fa', area:30, setup:18000, monthly:350, water:150, hours:.6, peak:3, waterPeak:2.5, step:1 },
  { id:'peach', category:'Gyümölcsös', name:'Őszibarackfa', icon:'🍑', unit:'fa', area:25, setup:18000, monthly:400, water:180, hours:.7, peak:3, waterPeak:2.5, step:1 },
  { id:'plum', category:'Gyümölcsös', name:'Szilvafa', icon:'🟣', unit:'fa', area:30, setup:16000, monthly:300, water:140, hours:.5, peak:3, waterPeak:2.5, step:1 },
  { id:'currant', category:'Gyümölcsös', name:'Ribizlibokor', icon:'🫐', unit:'bokor', area:2, setup:3500, monthly:80, water:25, hours:.1, peak:3, waterPeak:2.5, step:1 },
  { id:'raspberry', category:'Gyümölcsös', name:'Málnatő', icon:'🫐', unit:'tő', area:.8, setup:1500, monthly:50, water:15, hours:.08, peak:3, waterPeak:2.5, step:1 },
  { id:'hen', category:'Állatok', name:'Tojótyúk', icon:'🐔', unit:'állat', area:1.02, setup:22000, monthly:350, water:.355*365/12, hours:.35, peak:1.2, waterPeak:1.6, feed:.125, feedKind:'grain', feedPrice:180, step:1 },
  { id:'broiler', category:'Állatok', name:'Húscsirke', icon:'🐓', unit:'átlagos állomány', area:5, setup:16000, monthly:500, water:10, hours:.35, peak:1.4, waterPeak:1.6, feed:.15, feedKind:'grain', feedPrice:180, step:1 },
  { id:'duck', category:'Állatok', name:'Kacsa', icon:'🦆', unit:'állat', area:15, setup:22000, monthly:450, water:30, hours:.45, peak:1.3, waterPeak:1.6, feed:.18, feedKind:'grain', feedPrice:180, step:1 },
  { id:'goatmilk', category:'Állatok', name:'Tejelő kecske', icon:'🐐', unit:'állat', area:20.5, setup:180000, monthly:3500, water:7.6*365/12, hours:7, peak:1.5, waterPeak:20/7.6, feed:2.5, feedKind:'forage', feedPrice:100, step:1 },
  { id:'goatmeat', category:'Állatok', name:'Húscélú kecske', icon:'🐐', unit:'állat', area:50, setup:150000, monthly:2500, water:150, hours:3, peak:1.5, waterPeak:1.6, feed:2, feedKind:'forage', feedPrice:100, step:1 },
  { id:'sheep', category:'Állatok', name:'Juh', icon:'🐑', unit:'állat', area:40, setup:130000, monthly:2500, water:4.75*365/12, hours:2.5, peak:2, waterPeak:2.4, feed:800/365, feedKind:'forage', feedPrice:100, step:1 },
  { id:'pig', category:'Állatok', name:'Sertés', icon:'🐖', unit:'átlagos állomány', area:25, setup:180000, monthly:3000, water:360, hours:4, peak:1.3, waterPeak:1.6, feed:2.5, feedKind:'grain', feedPrice:180, step:1 },
  { id:'cowmilk', category:'Állatok', name:'Tejelő szarvasmarha', icon:'🐄', unit:'állat', area:120, setup:1800000, monthly:15000, water:2100, hours:22, peak:1.3, waterPeak:1.6, feed:14, feedKind:'forage', feedPrice:100, step:1 },
  { id:'cowmeat', category:'Állatok', name:'Húscélú szarvasmarha', icon:'🐂', unit:'állat', area:120, setup:1400000, monthly:10000, water:1500, hours:8, peak:1.5, waterPeak:68*365/12/1500, feed:11.8, feedKind:'forage', feedPrice:100, step:1 },
  { id:'bees', category:'Állatok', name:'Méhészet', icon:'🐝', unit:'méhcsalád', area:8, setup:100000, monthly:2000, water:5, hours:2, peak:3, waterPeak:2, step:1 },
];

export const DEFAULT_ASSUMPTIONS = {
  buildEconomy:500000, buildStandard:750000, buildComfort:1000000,
  designPct:6, houseLandFactor:3, constructionHours:35,
  personWater:110, contingencyPct:12, feedShare:50,
  purchasePct:5, purchaseFixed:250000,
  autoFeedSetup:45, autoFeedMonthly:5, autoFeedHours:.0015, grainYield:.45, forageYield:.45,
  irrigationSetup:1800, machinerySetup:1200000,
  irrigationLabourSaving:35, machineryLabourSaving:20, irrigationWaterSaving:20,
  heatingMonthly:25000,
};

export const SERVICES = {
  water: { name:'Vízellátás', icon:'💧', options:{ network:{name:'Vezetékes víz', setup:1800000, monthly:8000}, well:{name:'Kút + vízkezelés', setup:3500000, monthly:5000} } },
  power: { name:'Áramellátás', icon:'⚡', options:{ network:{name:'Hálózati áram', setup:1500000, monthly:18000}, solar:{name:'Hálózati napelem', setup:4000000, monthly:7000}, offgrid:{name:'Szigetüzem + akkumulátor', setup:7500000, monthly:10000} } },
  waste: { name:'Szennyvíz', icon:'♻️', options:{ network:{name:'Csatorna', setup:1500000, monthly:6000}, tank:{name:'Zárt tároló + ürítés', setup:2000000, monthly:20000}, treatment:{name:'Egyedi tisztító', setup:3500000, monthly:8000} } },
};

export function defaultPlan() {
  return {
    schemaVersion:2, dataVersion:DATA_VERSION,
    family:{ name:'A mi családunk', adults:2, children:1, budget:100000000, availableHours:100, livingMonthly:240000 },
    landQuote:{unitPrice:0}, food:defaultFoodProfile(),
    home:{ min:80, wish:120, locked:false, level:'standard', ownWorkPct:0 },
    reserve:{ min:6, wish:12, locked:false },
    site:{ paths:150, storage:40, parking:45, expansion:200, wastewater:25, fence:1200000, tools:800000, ownedTools:false, outbuildings:3000000, surveys:700000, relocation:500000, otherSetup:0, otherMonthly:0, toolsScope:'family',fenceScope:'shared',outbuildingsScope:'family' },
    services:{water:'network',power:'network',waste:'tank'}, serviceCatalogue:JSON.parse(JSON.stringify(SERVICES)),
    items:[{id:'garden',min:100,wish:200,locked:false,scope:'family',owned:false},{id:'hen',min:4,wish:10,locked:false,scope:'family',owned:false},{id:'apple',min:4,wish:10,locked:false,scope:'family',owned:false}],
    preferences:{ feedFlexible:false, irrigation:false, machinery:false, machineryScope:'family',budgetMode:'balance', balance:[1/3,1/3,1/3], landBudget:[1/3,1/3,1/3], resources:[1/3,1/3,1/3] },
    assumptions:{...DEFAULT_ASSUMPTIONS}, catalogue:CATALOGUE.map(x=>({...x})), sources:researchSources(),
  };
}
