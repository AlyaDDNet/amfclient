# Phase 1 validation

## Manual controls, restored framing and home copy — current

- Fixed zoom **1.1** selected by user from the original backup, not a newly fitted
  value. Native WebGL projection unchanged. Centre/trajectory collision no longer
  constrains the entire viewport or silently changes framing.
- Backup: `artifacts/route-before-manual-20261024-203728/`.
- Seven original anchors, their order/IDs/sections and point objects remain
  identical to `tests/fixtures/mandatory-20261024.json`; only global zoom restored.
- Editable controls saved separately in `segments`; locked anchor editing blocked
  in UI and server. Local rebuild/cache leaves unrelated legs exactly unchanged.
  Collision-checked Hermite junctions retain explicit control positions.
- **38 tests passed**, production build and editor-exclusion checks passed.
- Real GUI tests used **isolated** copy `artifacts/manual-editor-qa-20261024/`
  on port 5175. Added by clicking the line, dragged, saved, reloaded and confirmed
  persisted ID/coordinates, then deleted and saved. Preview with a manual control
  ran correctly. Invalid control at Y=32 stayed put, displayed error and disabled
  save/preview. No disposable controls written into the real project route.
- HTTP smoke rejects stale-save revision with 409, invalid geometry with 400,
  and proves the existing JSON was not overwritten. Endpoint uses atomic rename.
- Actual 1920×1080 production checks: home/start and Features/middle, Download/end
  all recorded zoom 1.100. Screenshots in artifacts: `nova-home-copy-1920.jpg`,
  `zoom-1.1-middle-1920.jpg`, `zoom-1.1-end-1920.jpg`; editor image:
  `manual-controls-editor.jpg`.
- Last home-copy change touched only `index.html` and `src/style.css` (plus build
  output). Hashes of route JSON/navigation/route/renderer remained unchanged
  throughout that text change. Map, Entities, animations, callbacks unchanged.

Earlier sections below are historical, including the rejected 0.34 framing.

## Gameplay route rework — 2026-10-24 (current)

- Old eight-point route and old route/main/editor source checkpoint:
  `artifacts/route-before-gameplay-20261024-201026/`.
- The user's seven NEW mandatory points were found in the existing editor tab.
  They had not reached the project JSON: its save had been rejected by the
  geometry/viewport check. Exported without modifying the editor's coordinates:
  `artifacts/route-user-export-20261024-202220.json`, SHA-256
  `B20CE9C0630AF6B20F0CE7D40C67267D2500F251122F50B76EE4A5AA158994A7`.
- Every point is in native air (index 0). At zoom 0.5 the Features point would
  put part of the viewport below the game boundary. Fixed global zoom 0.34 fits.
  The seven point objects and section bindings compare exactly with the export;
  no rounding, snapping, deletion or reordering was performed.
- A* + clearance/freeze traversal costs; native solid/no-hook/death obstacles;
  no diagonal corner cutting; spawn-connected domain; checked simplification and
  quadratic fillets. Current main route: 9609.075114 world units, 807 vertices.
- Each emitted chord checked against inflated obstacle AABBs; full viewport
  within map bounds across 3.5, 16/9, 4/3, 1 and 9/19.5 aspect ratios.
- Native freeze is not an impassable wall; unnecessary travel through masses of
  freeze is penalised, necessary crossings allowed. No Tee physics is claimed.
- `npm test`: **31 passed**, 0 failed. Includes the exact seven-point fixture,
  immutable coordinates/order, U-shaped obstacle, disconnected domain, both
  travel directions, shorter checked transfers, in-flight wheel interruption,
  endpoint clamps and 30/60/144 FPS equivalence. Existing map/Entities/envelope
  tests still pass. Geometry tests do not mutate the project route.
- `npm run build`: passed, including the production editor exclusion check.
- HTTP smoke: dev modules 200; invalid route geometry rejected without changing
  saved JSON; local-only write API checks; static production and map SHA passed.
- Read-only route report: `npx tsx scripts/validate-gameplay-route.ts` prints
  segment lengths, geometry validity and direct gameplay-transfer lengths.
- Final browser check on isolated dev port 5174 and static preview 4173:
  complete main-route forward preview reached distance/target 9609.08 at
  (5716.54, 1822.18); reverse wheel traversal reached distance/target 0 at
  (908.82, 1725.79). Zoom remained 0.340 in both directions.
- Short section transfers reach the same section coordinates; measured planned
  Home→Download length 6382.034 versus main-route 9609.075 world units.
  Reverse shortcut interrupted with forward wheel: target changed from Home
  to a nearby main-route position and completed there, without a point teleport.
- Features reached exactly (2894.87, 2056.13), distance/target 3763.49. Toggling
  Entities preserved camera XY, zoom, target and distance; independent animation
  time advanced 116226→125393 ms. Normal renderer and atlas code were unchanged.
- A moving path change first brakes on the existing checked geometry before
  starting the new connector; regression confirms no velocity reset/teleport.
- Browser editor: added a disposable mandatory point, checked valid rebuild;
  moved it outside allowed bounds, observed explicit error with unchanged
  coordinates; removed it before saving. This was BEFORE loading the user's
  final seven-point export; no QA points remain in the final file.
- Screenshots: `artifacts/route-seven-overview.jpg` (all 7 constraints and actual
  rendered level), `artifacts/route-seven-features.jpg` (normal production view).
- Static collision checks cannot prove Tee traversability with hook/jump/freeze
  physics, nor infer the map author's intended solution. This is geometric
  camera routing through the spawn-connected Game Layer, not a gameplay bot.

The following sections record earlier Phase 1 checks, not the current waypoint
coordinates. See the new seven-point fixture for current geometry evidence.

## Automated

- `npm test`: **18 passed**, 0 failed.
- `npm run build`: TypeScript, Vite static build and production-editor exclusion passed.
- `npm run dev -- --port 5174`: clean startup, Vite ready, HTTP 200 for index,
  `src/main.ts` and `src/editor.ts`. The user's original dev server on 5173 is preserved.
- `scripts/smoke-http.mjs`: dev modules, GET rejection / same-origin checks /
  malformed JSON handling on the local route API; static production map SHA,
  route JSON and missing production POST API all passed. This test never posts a
  valid replacement route and never writes the user's route.
- Original map hash and copied/production map hash match:
  `63CBC6C5BA1DA35F7449A1D9D8A4BEC5274E025A9C84445CDB3DCE8F76B3F0EB`.
- Production JavaScript **and CSS** do not include the route editor. No editor
  chunk is emitted; the route-writing middleware exists only in Vite serve mode.

## Browser validation actually performed

Chromium in-app browser, local Vite dev server and production preview:

- Real `.map` decode in Worker, embedded images uploaded to WebGL 2; no loading,
  module-resolution, resource or shader errors in the observed browser console.
- Main, Features and Download sections reached via navigation; camera movement
  observed, with route target/distance available as read-only canvas DOM telemetry.
- Wheel forward moved target from 0 to 700; reverse wheel moved it back to 0.
- During a Download transition, reverse wheel cancelled the long target and
  returned control to the current route position. No change to route geometry.
- Reverse keyboard travel also tested at the end of the route.
- Entities toggled with N and its button; actual game / front / tune / speedup
  tiles observed. No static screenshot/video background is used.
- Switching N at a stopped camera preserved X `5593.18`, Y `1335.83`, zoom `1.807`,
  distance and target `6972.71`. Animation time advanced from 35806 to 36067 ms.
  Draw calls changed from 13 (Entities) to 69 (normal), as expected.
- Native cloud movement was visible with a stopped camera. Automated tests also
  verify exact offsets from the original two envelopes at 0/45000/90000 and
  10000/65000 ms. Color, rotation and non-linear curves are covered by fixtures;
  they are not bound to layers in this particular map.
- 390×844 viewport: canvas resized to 390, document width remained 390 (no
  horizontal overflow), navigation/buttons/text remained usable. Desktop view
  also inspected. Temporary browser viewport override was reset.
- Production `?editor=1`: zero `#route-editor` elements and normal page rendering.

## Route editor

Before the user began editing the route, the dev editor was exercised through
real browser UI: free-camera drag, adding a point, dragging it, changing order,
assigning a section, deleting a point, importing JSON and saving to the project.
The import restored all section references. Saving produced the explicit
`Сохранено: public/camera-route.json` result and wrote the route file.

The user then confirmed they were editing in the same browser tab. All further
route-mutation QA was stopped. Their current route was saved through the existing
Save button and preserved. No coordinates, order or bindings were changed during
the subsequent Entities correction.

Preserved route SHA-256 before and after the Entities change:
`7459F1EECF7BB2E60F96C84C6174ECC6A0AB7B36B4210C05F3790C64CFEC7C29`.

Checkpoints are in `artifacts/` (excluded from build):
`camera-route-before-qa.json`, `camera-route-user-saved.json`, and
`camera-route-preserved-before-entities.json`. They were not restored over the
user's current route. Automated geometry tests use `tests/fixtures/route.json`.

The JSON Export button is implemented but its download dialog was not exercised
after the user started editing. Import, saving, direct JSON validation/roundtrip,
and subsequent use of the saved route in production were verified.

## Entities correction and BestClient comparison

Read-only inspection of BestClient's map preview established:

- Atlas URL: `https://bestclient.fun/mappreview/entities/comfort.png`.
- Clear background: neutral RGB `(0.5, 0.5, 0.5)`.
- Atlas: 1024×1024, native 16×16 DDNet index layout.

The PNG is byte-identical to the original local DDNet 20.1.1 resource
`data/assets/entities/comfort/ddnet.png`: 127165 bytes, SHA-256
`4CBF66DF078A56FFAF245B658638A54F50B5DAB5681E6BD6D7272DFF42688E50`.
Its original notice attributes **louis**, CC BY-SA 3.0. The official DDNet copy is
used, with its notice included; no proprietary BestClient code/art was copied.

Main atlas checks cover all indices actually present:

- Game: 1×11010, 3×258, 9×1036, 192×1.
- Front: 11×64, 33×13, 34×13, 62×12, 64×4.
- Tune: 68×6.
- Tele: empty in this map; index identity tested, no actual teleport visual claim.
- Speedup: eight type-28 entries, all `force=5`, `maxSpeed=0`, `angle=180`.

Game/front freeze, unfreeze, hook and unhook use unchanged raw indices with the
Comfort atlas. Speedups use the official dedicated arrow image rotated from the
raw angle; they no longer sample an unrelated type-28 atlas cell. All eight
left-facing arrows were observed in the browser. Number labels are suppressed
when tiles are smaller than the existing 16px readability threshold.

Screenshots:

- `artifacts/entities-speedups.jpg`: final Comfort + neutral background and real arrows.
- `artifacts/nova-home.jpg`: final normal map mode (when generated by QA).
- `artifacts/entities-comfort.jpg`: intermediate atlas comparison, before the final
  neutral background correction; use `entities-speedups.jpg` for final appearance.

## Explicit limits

No live DDNet screenshot was used for a pixel-by-pixel native renderer comparison.
There are no gameplay QFr/QHook Move Tiles in the supplied map. Its only position
bindings animate two cloud quads. Move-Tiles-compatible position/rotation, color
and curve math is implemented and tested, but a separate map with actual gameplay
moving quads is needed for that visual comparison. See README for format limits.

No claim of identical FPS on all hardware, full gameplay simulation, or full
pixel identity with DDNet/BestClient is made. WebGL context restoration and long
background-tab lifetime were implemented but not force-triggered through browser
debug APIs. No website publication, Git push, client build or client-source edit
was performed.
# Дополнение: свободное рисование, 2026-10-24

Проверки выполнены на отдельной копии `artifacts/freehand-qa-20261024`, порт 5177.
Основной `public/camera-route.json` не очищался и не заменялся.

- Браузер: рисование, продолжение от конца, перетаскивание точки линии,
  отмена/повтор штриха, назначение разделов, сохранение и reload.
- Браузер: отмена подтверждения очистки сохраняет 17 точек; подтверждённая
  очистка даёт 0; Undo возвращает 17; Redo — 0; сохранение пустого маршрута
  и reload сохраняют 0. После этого повторно нарисован и сохранён новый маршрут.
- Браузер: preview до конца и обратно через ползунок; telemetry показывает
  постоянный zoom 1.100 и возврат routeDistance к 0.00.
- Автотесты проверяют независимость freehand от collision/A*, движение по длине,
  локальное сглаживание без overshoot, JSON, продолжение, Undo/Redo, удаление
  диапазона, границы, прямой/обратный ход. Прежние тесты автопути сохраняются.
- Скриншот: `artifacts/freehand-editor-verified.jpg` (тестовый нарисованный путь).

# Исправление комментариев браузера: удаление и стены

Исходный несохранённый черновик с `control-e4b5bf4e` экспортирован перед HMR:
`artifacts/before-editor-wall-delete-20261024/user-editor-draft.json`.
Коррекция `(2738.3268572598035, 1277.8606549358244)` отклонялась старым A*.
Кнопка удаления в этом состоянии работала; ограничение Delete только режимом
`edit` воспроизведено по исходному обработчику и удалено.
Проверено в браузере: Delete в старом режиме удаляет коррекцию, preview снова
доступен; Undo возвращает черновик. Перевод через «Редактировать маршрут»
с подтверждением сохраняет все 8 точек/коррекций и включает сохранение,
несмотря на точку в стене. В ручном режиме Delete/Undo также проверены.
Автотесты дополнены реальными координатами этой коррекции и проверкой
конвертации без потери 7 исходных обязательных точек и привязок разделов.

# Повторное исправление: очистка возвращала авто-режим

Сценарий пользователя: после очистки старого JSON без `mode` функция emptyRoute
сохраняла отсутствие mode; appendAnchor также оставляла авто-режим.
Вторая точка `point-40953bda` `(2264.5825310121263,1303.4882802944621)`
находится в реальной стене Game Layer и отклонялась старым CameraRoute.
Первичная точка `(1950.1122915033047,1266.656034568862)` оставалась на месте,
а красная линия показывала последнюю успешную авто-геометрию, не новый конец.

Исправлено: emptyRoute всегда создаёт freehand; appendAnchor переводит старый
редактируемый черновик в freehand; загрузка в редактор сразу создаёт ручной
черновик после резервирования исходного JSON; импорт/Undo/restore также больше
не возвращают проверку стен. Публичный просмотр старого сохранённого маршрута
не меняется до явного сохранения пользователем.
Новая регрессия использует точные координаты обеих точек со скриншота,
проверяет реальное solid collision второй точки, прямое соединение, точный
конец маршрута и сохранение freehand после JSON roundtrip. Всего 53 теста.
Сохранённый пользовательский черновик: artifacts/before-clear-wall-fix-20261024/user-two-points.json.
Браузерная проверка выполнена в отдельном проекте D:/AMF-Website-QA-20261024-clear-walls
на порту 5179: импорт двух исходных точек, очистка с подтверждением, два обычных
клика (включая стену), успешное сохранение, reload, наличие двух точек и
работающий preview до конца. Заголовок остаётся «Ручной маршрут · без ограничений стен».

# Final Camera Route & Navigation Update

Использован public/camera-route.json, SHA-256
F069573D0919D29434C1B3C9ECBDED86340691E4A582C9AC0247834611FD668A.
Резервная копия: artifacts/before-final-navigation-20261024/camera-route.json.
7 mandatory-точек, freehand, zoom 1.1, геометрия не изменялась.

62 автоматических теста: все упорядоченные пары основных точек на 30/60/144 FPS,
неоконченный переход на 999 мс и точное назначение на 1000 мс; прямые координатные
переходы 7→1, 1→7 и 2→6 без посещения промежуточных точек, retarget из текущего
визуального положения, повтор цели, колесико после посадки и отложенное применение
его дельты при прокрутке во время вкладочного перехода.
KeyN проверена с key=n/N/т/Т, repeat, текстовым вводом и модификаторами.
ОС-раскладки RU/UA отдельно не переключались: их значения покрыты unit-тестом;
в браузере проверено реальное нажатие N и отсутствие переключения в input.

Браузер: семь вкладок, 1→7, 7→1, 2→6 и быстрое переключение до Интерфейса;
координаты середины переходов совпадают с прямой eased-интерполяцией, конечные
координаты точны, telemetry navigationMs=1000 и zoom 1.100. Колёсико после посадки
продолжает путь по JSON-линии. Проверено меню 390×844 без горизонтального
выхода страницы; семь вкладок доступны горизонтальной прокруткой.
Изолированный проект D:/AMF-Website-QA-Final-Navigation-20261024 использован
для сохранения нового названия вкладки через редактор. Запись site-sections.json
успешна, маршрут не меняется. Основной файл контента не заменён тестовым.
В ходе этой правки browser console ошибок не показала.

