import {DOCUMENT_LINKS} from './research-document.mjs';
// User-supplied collection, supplemented by the uploaded Word document.
// Links are preserved; original articles have not been independently verified.
export const COLLECTION_URL='https://claude.ai/artifact/DZzVpmTHJ1VVdeGM8inb3V#3787bb95-886c';
export const RESEARCH_DATE='2026-10-13';
export const RESEARCH=[
  {group:'Építés',name:'Új családi ház',value:'537 000 Ft/m² (2022); 240 000 Ft/m² (2018)',source:'Privátbankár, KSH-adat',note:'Áfa nélkül. 200 m² felett a gyűjtés szerint 582 000 Ft/m². Régi árszint; nem mai árajánlat.'},
  {group:'Építés',name:'Lakásépítési átlag',value:'596 000 Ft/m² (2023)',source:'Bank360, KSH-adat',note:'Minden lakástípus átlaga; nem kizárólag vidéki családi ház.'},
  {group:'Építés',name:'Kulcsrakész könnyűszerkezetes ház',value:'Nettó 450 000–600 000 Ft/m² (2026 eleje)',source:'Economx, Duna House számítás',note:'Hőszivattyúval; a telek külön tétel. Hasznos/bruttó alapterület-bázis nem tisztázott.'},
  {group:'Építés',name:'Kulcsrakész családi ház',value:'650 000–780 000 Ft/m² (2026)',source:'VG, szponzorált kivitelezői cikk',note:'Ajánlati szint, nem független statisztika; az áfa és az alapterület-bázis tisztázandó.'},
  {group:'Építés',name:'Piaci építési ársáv',value:'700 000–1 000 000 Ft/m² (2026)',source:'Bankmonitor',note:'Piaci tapasztalat. A nettó/bruttó és a műszaki tartalom összevetése még szükséges.'},
  {group:'Építés',name:'Liapor készház',value:'530 000–550 000 Ft/m² + áfa',source:'Economx',note:'100–150 m² ház, beépített terület szerint. A cikk dátuma nem ismert.'},
  {group:'Építés',name:'Kedvezményes áfa',value:'A gyűjtés 5%-ot és 2026. december 31-et említ',source:'RE/MAX riport, Economx',note:'Jogosultsági és engedélyezési feltételek nem tisztázottak. A modell nem alkalmaz automatikus 5%-os áfát.'},
  {group:'Tojótyúk',name:'Fedett hely és kifutó',value:'0,28 m² fedett + legalább 0,74 m² kifutó / madár',source:'Convoy of Hope',note:'3 és 8 négyzetláb átváltása. Külföldi irányadó szám, nem magyar jogi vagy jóléti megfelelőségi igazolás.'},
  {group:'Tojótyúk',name:'Takarmány',value:'100–150 g / madár / nap',source:'Convoy of Hope, ThePoultrySite',note:'Tojótakarmány. A modell 125 g-os középértéket használ.'},
  {group:'Tojótyúk',name:'Ivóvíz',value:'0,24–0,47 liter / madár / nap',source:'Convoy of Hope, UGA',note:'Melegben több. UGA: 20 tyúk hűvösben kb. 3,8 liter/nap. A modell a 0,355 literes középértéket használja.'},
  {group:'Tejelő kecske',name:'Fedett és kültéri hely',value:'1,4–2,8 m² fedett; másik útmutató: 1,9 m² fedett + 18,6 m² kültéri',source:'UC ANR, Almanac',note:'A modell az Almanac szerinti 20,5 m² összesített irányadó helyet választja; a takarmányterület ezen felül jön.'},
  {group:'Tejelő kecske',name:'Kifutó',value:'Legalább 2,3 m² / állat',source:'NMSU',note:'Fedett tartás mellett külön mozgástér. Nem azonos a legelővel.'},
  {group:'Tejelő kecske',name:'Ivóvíz',value:'Kb. 7,6 liter / nap; szárazon kb. 3,8 liter / nap',source:'UC ANR',note:'A 7,6 liter napi kb. 3,8 liter tejtermeléshez kapcsolódik. A modell ezt az állapotot használja a tejelő kecskénél.'},
  {group:'Tejelő kecske',name:'Laktációs vízcsúcs',value:'Akár 10 liter / nap, melegben ennek kétszerese',source:'ACT kódex',note:'A modell 20 liter/napos csúcsot használ a tejelő kecskénél, nem éves átlagként.'},
  {group:'Tejelő kecske',name:'Takarmány',value:'Nem érkezett számszerű adat',source:'Missouri Extension',note:'Rostban gazdag takarmány és tejtermeléshez szemes kiegészítés. A modell száma továbbra is becslés.'},
  {group:'Juh',name:'Ivóvíz',value:'3,8–5,7 liter / nap, kb. 1,8 kg szárazanyag felvétele után',source:'SDSU Extension',note:'Élettani állapottól függ; a modell 4,75 literes középértéket használ.'},
  {group:'Juh',name:'Vemhesség és szoptatás vízigénye',value:'5 liter, később 6 liter; szoptatáskor több mint 10 liter / nap',source:'Farmers Journal, Teagasc ajánlás',note:'Írországi adat. A 10 liter nem felső korlát; a modell csúcsbecslése továbbra is ellenőrizendő.'},
  {group:'Juh',name:'Éves takarmány',value:'0,3 t széna + 0,5 t legelői szárazanyag / jerke / év',source:'University of Kentucky',note:'Kentucky viszonyok. 800 kg/év ≈ 2,19 kg/nap; nem magyar területi hozam.'},
  {group:'Juh',name:'Munka',value:'5–7 óra / jerke / év 25–30 állatnál; 2,5–3 óra 200 állatnál',source:'University of Kentucky',note:'Méretfüggő üzemi adat. Néhány állatnál nem alkalmazzuk automatikusan; a modell munkaegyütthatója becslés marad.'},
  {group:'Húshasznú szarvasmarha',name:'Takarmány',value:'11,8 kg szárazanyag / nap, kb. 454 kg-os tehénnél',source:'NDSU',note:'26 font átváltása. Nagyobb tehénnél a gyűjtés 16,5 kg-ot említ. A modell az első esetet veszi alapul.'},
  {group:'Húshasznú szarvasmarha',name:'Legelő',value:'Kb. 0,82 ha/hó / tehén-borjú pár',source:'NDSU',note:'Észak-dakotai természetes legelő. Magyar állandó hektárigényként nem alkalmazzuk.'},
  {group:'Húshasznú szarvasmarha',name:'Éves takarmány',value:'Kb. 1 t széna + 4 t legelői szárazanyag',source:'University of Kentucky',note:'Kentucky viszonyok; eltérő referenciaállat, nem vonjuk össze automatikusan a napi NDSU adattal.'},
  {group:'Húshasznú szarvasmarha',name:'Nyári ivóvíz',value:'Kb. 68 liter / nap, 32 °C-nál és kb. 499 kg testtömegnél',source:'Big Sandy Mountaineer, OSU-idézet',note:'Másodlagos hivatkozás; a modell vízcsúcsának irányadó alapja, nem éves átlag.'},
];

export function researchSources() {
  const source=(title,note,status='provided')=>({title,url:COLLECTION_URL,date:RESEARCH_DATE,status,note:`Beküldött Word-gyűjtés alapján; önállóan nem ellenőrzött. Dátum: a gyűjtés dátuma, nem feltétlenül a publikálásé. ${note}`});
  const records={
    'assumptions.buildEconomy':source('Tervezési árszint; gyűjtés: Economx / Duna House','500 000 Ft/m² bruttó próbaérték. A nettó 450–600 ezres adatból nem vezethető le ellenőrzött bruttó ár; áfa és alapterület-bázis tisztázandó.','estimate'),
    'assumptions.buildStandard':source('Tervezési árszint; gyűjtés: VG / Bankmonitor','750 000 Ft/m² bruttó próbaérték, ajánlatból ellenőrizendő.','estimate'),
    'assumptions.buildComfort':source('Tervezési árszint; gyűjtés: Bankmonitor','1 000 000 Ft/m² bruttó próbaérték; nem kulcsrakész kivitelezési garancia.','estimate'),
    'catalogue.hen.area':source('Convoy of Hope · helyigény','0,28 m² fedett + 0,74 m² kifutó = 1,02 m². Külföldi irányadó érték, magyar feltételek ellenőrizendők.'),
    'catalogue.hen.feed':source('Convoy of Hope / ThePoultrySite · takarmány','100–150 g/nap középértéke: 125 g/nap.'),
    'catalogue.hen.water':source('Convoy of Hope · ivóvíz','0,24–0,47 liter/nap középértéke × 365/12 = 10,80 liter/hó.'),
    'catalogue.goatmilk.area':source('Almanac · kecske helyigénye','1,9 m² fedett + 18,6 m² kültéri = 20,5 m², takarmányterület nélkül.'),
    'catalogue.goatmilk.water':source('UC ANR · tejelő kecske ivóvize','7,6 liter/nap × 365/12 = 231,17 liter/hó; kb. 3,8 liter/nap tejtermelés mellett.'),
    'catalogue.goatmilk.waterPeak':source('ACT kódex · vízcsúcs','20 liter/napos forró időszak a 7,6 literes alaphoz viszonyítva: 20/7,6-szoros.'),
    'catalogue.sheep.water':source('SDSU Extension · juh ivóvize','3,8–5,7 liter/nap középértéke × 365/12 = 144,48 liter/hó.'),
    'catalogue.sheep.feed':source('University of Kentucky · éves takarmány','(300 kg széna + 500 kg legelői szárazanyag) / 365 nap = 2,19 kg/nap. Helyi hozamot nem igazol.'),
    'catalogue.cowmeat.feed':source('NDSU · tehén szárazanyag-felvétele','11,8 kg/nap, 454 kg-os referenciaállat. A teljes takarmányadag összetétele nincs modellezve.'),
    'catalogue.cowmeat.waterPeak':source('Big Sandy Mountaineer / OSU · nyári víz','68 liter/nap 32 °C-nál, kb. 499 kg testtömegnél. Az éves vízátlag továbbra is becslés.'),
    'assumptions.designPct':source('VG, 2025 · tervezés és engedélyeztetés','A gyűjtésben 5–10% szerepel. A modell 6%-ot feltételez; műszaki ellenőr és talajvizsgálat külön költség.','estimate'),
    'catalogue.cowmilk.feed':source('MATE diplomadolgozat · tejelő tehén','14–25 kg szárazanyag/nap, 650 kg-os tehénnél. A modell 14 kg-os alsó értéket használ; nagy tejhozamhoz ez kevés lehet.'),
    'assumptions.grainYield':source('MATE szakdolgozat, 2025 · búzahozam','4–5 t/ha = 0,4–0,5 kg/m². A modell 0,45 kg/m²-t vesz takarmánygabona-tervezési közelítésként; fajta és hely szerint módosítandó.','estimate'),
    'catalogue.feedgrain.feedYield':source('MATE szakdolgozat, 2025 · búzahozam','4–5 t/ha középértéke: 0,45 kg/m²/év. A takarmánygabona itt búzával közelített hozam.','estimate'),
    'serviceCatalogue.water.options.well.setup':source('Pénzcentrum, 2026 · kútfúrás','15–25 ezer Ft/m és helyfüggő teljes ár. A modell 3,5 M Ft-os teljes rendszerkerete becslés, vízkezeléssel együtt; nem a cikkből átvett ár.','estimate'),
    'serviceCatalogue.power.options.offgrid.setup':source('Telex, 2023 · napelem és akkumulátor','Régi adat: kb. 7 M Ft-os önellátásra törekvő rendszer. A modell 7,5 M Ft-ja friss ajánlatot igénylő becslés; nem méretezett teljes szigetüzem.','estimate'),
  };
  const linkKeys={
    'assumptions.buildEconomy':'duna-house-konnyuszerkezetes',
    'assumptions.buildStandard':'mennyibe-kerul-ma-epitkezni',
    'assumptions.buildComfort':'?p=106552',
    'assumptions.designPct':'koltsegkeret-csaladi-haz',
    'assumptions.grainYield':'13847/1',
    'catalogue.feedgrain.feedYield':'13847/1',
    'catalogue.hen.area':'Laying-Hens.pdf','catalogue.hen.feed':'Laying-Hens.pdf','catalogue.hen.water':'Laying-Hens.pdf',
    'catalogue.goatmilk.area':'raising-goats-beginners','catalogue.goatmilk.water':'node/140215','catalogue.goatmilk.waterPeak':'1995-98.PDF',
    'catalogue.sheep.water':'sheep-water-requirements','catalogue.sheep.feed':'asc126.htm',
    'catalogue.cowmeat.feed':'bt404.pdf','catalogue.cowmeat.waterPeak':'green-acres/5173','catalogue.cowmilk.feed':'114/1',
    'serviceCatalogue.water.options.well.setup':'20260312',
    'serviceCatalogue.power.options.offgrid.setup':'2023/01/30',
  };
  for(const [path,part] of Object.entries(linkKeys))records[path].url=DOCUMENT_LINKS.find(x=>x.includes(part))||COLLECTION_URL;
  return records;
}
