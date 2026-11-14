# Becslő fixture-ök (ORD-377, 4.28.0)

A `estimate-run.js` közös referencia-fixture-je. A Sling-port (SLING-77) ugyanezeket a fájlokat
olvassa, és bájtra ugyanazt a kimenetet kell adnia. A futtató: `scripts/estimate-run.fixtures.test.js`
(`node estimate-run.fixtures.test.js`; `--update` csak szándékos rögzítéshez).

## Szerkezet

```text
pricing.json        közös ártábla (test-sonnet, test-haiku; USD / 1M token)
fingerprint.json    a becsült story ujjlenyomata
cases/<eset>/
  args.json         az `argv` tömb
  features.json     a story jellemzői (epic esetben stories.json)
  store.jsonl       a korábbi futások (run-metrics/v1, minden sor érvényes)
  expected.txt      a szöveges kimenet (bájtra egyező elvárás)
  expected.json     a --json kimenet (bájtra egyező elvárás)
```

Az `args.json` útvonalai: `./fájl` az eset mappájához, `@F/fájl` ehhez a mappához relatív; minden
más argumentum szó szerinti. A szöveges kimenethez az `argv`-t változtatás nélkül, a JSON-hoz a
végére tett `--json` kapcsolóval kell futtatni. A kimenetben nincs időbélyeg és nincs véletlen.

## Számolási konvenciók (szerződés a portnak)

- **Percentilis:** lineáris interpoláció (numpy `linear`, "type 7"): rendezett értékeknél a
  pozíció `(n-1)*p/100`. Példa: `[1,2,3,4,5]` P80 = 4,2.
- **Kerekítés:** félre-fel, `Math.round(x*10^d)/10^d`. Pythonban `floor(x*10^d+0.5)/10^d`; a
  beépített `round` bankár-kerekítése nem jó. A JSON-ban pénz 4 tizedesre, idő és token egészre.
- **Megjelenítés:** a pénz `toFixed(2)` (pontos bináris egyenlőségnél felfelé: `3.125` → `3.13`,
  `1.375` → `1.38`, `11.875` → `11.88`; Pythonban nem a beépített `format`, hanem félre-fel
  kerekítés kell). A korrekciós szorzó ugyanígy két tizedes. Tizedesjel pont. Idő: < 60 s `<1 p`,
  < 1 óra `45 p`, egyébként `1 ó 25 p` (a perc félre-fel kerekített). Token: ≥ 1 000 000 `1.9M`,
  ≥ 1 000 `820k`.
- **Skálázás:** minden minta minden mutatója a `cél lépésszám / minta lépésszám` arányában
  skálázódik, majd P50/P80 számolódik a k kiválasztott mintán (`k = min(5, n)`).
- **Szomszédválasztás:** rendezés `(komplexitás eltér, d, story)` szerint; `d = |lépés - cél lépés| /
  max(cél lépés, 1) + |helyi arány - cél helyi arány|`; a story-összehasonlítás szövegesen (`<`).
- **Hatókör-létra:** saját projekt szigorú → saját projekt laza → minden projekt szigorú →
  minden projekt laza → heurisztika; az első lépcső nyer, ahol az anomália-kizárás utáni minták
  száma legalább `--min-samples`. Szigorú ujjlenyomat: `local_model`, `epic_story_host`,
  `local_executor_host`, `ci_runner`; laza: csak a `local_model`.
- **Heurisztikus mód:** (a használható story-sorok mutatóinak összege / a lépésszámok összege) ×
  a cél lépésszáma = P50; P80 = P50 × `HEURISTIC_P80_FACTOR` (1,5, hangolható konstans, a
  `estimate/heuristic.js`-ben). Az anomália-kizárás (`--exclude-anomalies on`) a heurisztikus ágra is érvényes: az anomáliás sorok nem számítanak bele (a `heuristic:n<N>` is a szűrt darabszám); a `heuristic` fixture sorai nem anomáliásak, ezért az elvárt kimenete nem változott.
- **Kalibráció:** a sor `estimate.raw.p50.<mutató>` (> 0) és a tényleges érték hányadosainak
  mediánja, [0,5; 2] közé szorítva, mutatónként legalább `--min-samples` párnál; a nyers (`raw`)
  értékből számol, így nem halmozódik. A P80 találati arány: `tényleges <= a sor estimate.p80-a`.
- **epic_overhead hatókör:** ha a projektnek van `epic_overhead` sora, az nyer (csak a saját
  projekt sorai), különben minden projekt sora. Egy overhead-sor értéke osztva az azonos epic
  story-sorainak számával; a P50/P80 ezekből a "per-story" értékekből számolódik, szorozva az új
  epic storyjainak számával. Az összeg a storyk és az overhead kulcsonkénti összege.
- **Mintaazonosító:** `ORD:n6`, `all:n9:ORD1`, `heuristic:n2`.
- Az estimate/v1 JSON-ban nincs `label`: a `minta:` sort a formázó a `sample` mezőből állítja elő.

## Esetek és a kézzel számolt ellenértékek

Minden eset elvárása a futtató kimenete (`--update`), de minden eset legalább egy értékét előbb
kézzel számoltuk ki; a kódkimenet mindegyikkel egyezett.

Közös modell a store-sorokban: `cost_usd` = a megadott érték; 80% `test-sonnet`, 20% `test-haiku`;
a falióra mellett az aktív idő a falióra 60%-a, a helyi LLM 25%-a, a CI futás 10% + sor 3,33%.

**`project-own`.** Cél: `ORD-100`, M, 14 lépés, 4/5 helyi sub-task (helyi arány 0,8). 6 `ORD`
sor szigorúan egyező ujjlenyomattal és 2 `SLG` sor (nagy értékekkel; nem szabad beleszámítania).
Távolságok: ORD-11 0; ORD-15 0,3; ORD-16 0,5; ORD-12 0,55; ORD-13 1,0; ORD-14 komplexitás-eltérő
(L), ezért kiesik (k = 5 a 6-ból). Költség 14 lépésre skálázva: ORD-11 3,00; ORD-15 2,50;
ORD-16 4,5×14/21 = 3,00; ORD-12 1,4×2 = 2,80; ORD-13 7,0×0,5 = 3,50. Rendezve `2,5 2,8 3,0 3,0
3,5`: **P50 = 3,00** (3. elem), **P80** = 3,0 + 0,2×(3,5-3,0) = **3,10**. Falióra: 5400; 4800;
7200×14/21 = 4800; 2700×2 = 5400; 12600×0,5 = 6300 → rendezve `4800 4800 5400 5400 6300`: P50 =
5400 (1 ó 30 p), P80 = 5400 + 0,2×900 = 5580 (93 p). Token: 1 080 000 / 1 116 000. Elvárt minta:
`ORD n=6`, `ORD:n6`, szigorú.

**`fallback-all`.** Cél: `ORD-200`, M, 10 lépés, 2/4 helyi. 1 `ORD` sor és 8 `SLG` sor, mind
szigorúan egyező; `--min-samples 3`, ezért saját projekt (n = 1) elégtelen, minden projekt n = 9,
`n_project = 1`. A 5 legközelebbi: ORD-21 (d 0), SLG-1 (0), SLG-4 (0,25), SLG-3 (0,5), SLG-5 (0,5);
SLG-6 és SLG-7 komplexitás-eltérő, SLG-2 (1,0) és SLG-8 (3,0) messzebb. Skálázott költség: 2,50;
3,00; 2,75; 1,00×2 = 2,00; 5,1×10/15 = 3,40. Rendezve `2,0 2,5 2,75 3,0 3,4`: **P50 = 2,75**,
**P80** = 3,0 + 0,2×0,4 = **3,08**. Elvárt: `minden projekt n=9 (ORD n=1)`, `all:n9:ORD1`.

**`heuristic`.** Cél: `ORD-300`, 12 lépés. A store-ban 2 használható story-sor (ORD-31: 10 lépés,
2,5 $; SLG-9: 20 lépés, 6,0 $) és 1 `epic_overhead` sor (nem számít). Lépésenkénti átlag =
(2,5+6,0)/(10+20) = 0,28333 $ → **P50 = 0,28333×12 = 3,40**, **P80 = 3,40×1,5 = 5,10**. Elvárt:
`basis: heuristic`, `confidence: low`, `heuristic:n2`, az "alacsony megbízhatóság" sor.

**`loose-anomalies`.** Cél: `ORD-400`, M, 10 lépés. 6 `ORD` sor, a `ci_runner` mind eltér a
céltól: a szigorú szint 0 sort ad, a laza (`local_model`) mind a 6-ot. ORD-43 `breaker_open`
anomáliás, faliórája 6000 s; a tiszta sorok `3000 3300 3600 3600 3900`, mediánjuk 3600, az
anomáliás sor mediánja 6000, ezért **extra = 6000-3600 = 2400 s = +40 p**. A kizárás után 5 minta
(`n = 5`, `k = 5`, minden lépésszám = a cél, nincs skálázás): költség `2,0 2,2 2,4 2,6 2,8` →
**P50 = 2,40**, **P80 = 2,6+0,2×0,2 = 2,64**; falióra P80 = 3600+0,2×300 = 3660 s. Javítókör
tartomány: `0 1 0 2 1` → 0–2. Elvárt: `ujjlenyomat: laza`, `Kockázat: 1/6 hasonló futásban
breaker_open (+40 p)`.

**`calibration`.** Cél: `ORD-500`, M, 10 lépés. ORD-51…54-nek van `estimate.raw` és `estimate.p80`,
az ORD-55 és ORD-56 (L) nincs. Költség-arányok (tényleges / nyers P50 = 2,0): 1,5/2 = 0,75;
2,5/2 = 1,25; 2,5/2 = 1,25; 3,0/2 = 1,5 → rendezve `0,75 1,25 1,25 1,5`, **medián = 1,25**.
Találat (a tényleges <= a tárolt P80): 1,5<=2,0 igen; 2,5<=3,0 igen; 2,5<=2,5 igen (pontos
egyenlőség); 3,0<=2,4 nem → **3/4**. A k = 5 minta (ORD-51…55; az L sor kiesik) költsége `1,5 2,0
2,5 2,5 3,0`: nyers P50 = 2,5, nyers P80 = 2,5+0,2×0,5 = 2,6; a korrekció után **2,5×1,25 = 3,125**
és **2,6×1,25 = 3,25**. A falióra-arányok `2,5 3,0 2,0 4,0` mediánja 2,75, ami a felső határra
(2) szorul: a korrigált falióra a nyers 3000/3200 kétszerese (6000/6400); a falióra találati
aránya 0/4 (a tárolt P80 mind 1200). Elvárt: `Korrekció: ×1.25 (n=4 korábbi becslés)` és a
`P80 találati arány: költség 3/4, falióra 0/4` sor.

**`epic`.** `ORD-60`: ORD-61 (10 lépés), ORD-62 (20), ORD-63 (5), mind M. A store: 4 story-sor
(ORD-81, 82 az ORD-8 epicben, ORD-91, 92 az ORD-9-ben; 10 lépés, költség 2,0 2,5 3,0 3,5) és 2
`epic_overhead` sor (ORD-8: 2,0 $ / 1200 s; ORD-9: 1,0 $ / 600 s). Storyk: 10 lépés →
P50 = 2,75, P80 = 3,0+0,4×0,5 = 3,20; 20 lépés → ×2 = 5,50 / 6,40; 5 lépés → ×0,5 = 1,375 /
1,60. Overhead per story: 2,0/2 = 1,0 és 1,0/2 = 0,5 → P50 = 0,75, P80 = 0,5+0,8×0,5 = 0,90;
3 storyra **2,25 / 2,70** (falióra 450 és 540 s per story → 1350 / 1620 s). **Összeg**: P50 =
2,75+5,5+1,375+2,25 = **11,875**; P80 = 3,2+6,4+1,6+2,7 = **13,90**. A szövegben `11.88` (félre-fel).

**`subtasks`.** `ORD-700`, `--subtasks`, 3 sub-task `ac_count` 4, 9, 8 (összsúly 21; a backend és
a tests helyi). 4 minta, 10 lépés, költség 2 3 4 5: P50 = 3,5, P80 = 4,0+0,4×1,0 = 4,4. A
költség-felosztás P50: 3,5×4/21 = 0,67; 3,5×9/21 = **1,50**; 3,5×8/21 = 1,33. A helyi LLM idő a
helyi sub-taskok súlyának arányában oszlik (4:8). Elvárt: `Sub-task bontás — FIGYELEM: alacsony
megbízhatóság (heurisztikus felosztás)`.

## Ismert sajátosságok

- A modellenkénti költség (`model_cost:*`, a szövegben a zárójeles bontás) az ártáblából és a
  tokenekből újraszámolt, tájékoztató érték; a `cost_usd` a sorban tárolt összköltség.
- A faliórán belüli `claude_s` maradék (`falióra - helyi - CI`).
- Az epic-összeg a P80-ak összege (konzervatív), és a hullámokat összeadja (párhuzamosság nincs
  modellezve).
