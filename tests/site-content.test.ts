import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { layoutItemTranslation, updateLayoutItemTranslation, validateContent } from '../src/site-content';
import { defaultElementLayout, elementLayout, materializeSectionLayout, projectLayoutBox, screenToWorld, sectionContentFrameId, worldToScreen, worldTransform } from '../src/site-layout';
import { validateRoute } from '../src/route';
import { cameraWithVerticalOffset, GAME_GROUP, groupView } from '../src/map/renderer';
import { AMF_DOWNLOAD } from '../src/download-config';
import { LOCALES, translationKeys, translate } from '../src/i18n';

const contentPath = resolve('public/site-sections.json');
const routePath = resolve('public/camera-route.json');

test('verified direct download buttons are restored inside the download frame', async () => {
	const content = validateContent(JSON.parse(await readFile(contentPath, 'utf8')));
	assert.equal(AMF_DOWNLOAD.url, 'https://github.com/AlyaDDNet/AMF-Client/releases/download/v2.0.1/AMFClient-2.0.1-Nova-Portable.zip');
	assert.equal(AMF_DOWNLOAD.releaseUrl, 'https://github.com/AlyaDDNet/AMF-Client/releases/tag/v2.0.1');
	assert.equal(AMF_DOWNLOAD.assetName, 'AMFClient-2.0.1-Nova-Portable.zip');
	const actions = content.sections.find(section => section.id === 'download')?.actions ?? [];
	assert.equal(actions.length, 2);
	assert.equal(actions[0]?.download, true);
	assert.equal(actions[0]?.href, AMF_DOWNLOAD.url);
	assert.equal(actions[1]?.href, AMF_DOWNLOAD.releaseUrl);
});

test('all seven outer frames match desktop dimensions on tablet and mobile without moving any layout object', async () => {
	const route = validateRoute(JSON.parse(await readFile(routePath, 'utf8')));
	const points = route.points.filter(point => point.mandatory === true);
	const content = validateContent(JSON.parse(await readFile(contentPath, 'utf8')));
	const previous = JSON.parse(await readFile(resolve('tests/fixtures/hand-placed-frame-geometry.json'), 'utf8'));
	assert.equal(points.length, 7);
	assert.deepEqual(content.sections.map(section => section.pointId), points.map(point => point.id));
	assert.equal(route.zoom, 1.1);
	const keys = new Set(translationKeys());
	for (const [index, section] of content.sections.entries()) {
		assert.ok(section.title.startsWith('i18n:'));
		assert.ok(section.subtitle?.startsWith('i18n:'));
		assert.ok(section.cards.length > 0);
		for (const locale of LOCALES) {
			for (const value of [section.title, section.subtitle ?? '', ...section.cards.flatMap(card => [card.title, card.text])]) {
				if (!value.startsWith('i18n:')) continue;
				const key = value.slice(5);
				assert.ok(keys.has(key), `${locale}:${key} must exist in the English dictionary`);
				assert.notEqual(translate(key, locale), key, `${locale}:${key} must resolve to localized text`);
			}
		}
		const before = previous.sections[index];
		const outerFrameId = sectionContentFrameId(section);
		const desktopFrame = section.layout?.desktop?.[outerFrameId];
		assert.ok(desktopFrame, `${section.id} has its saved desktop outer frame`);
		for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
			const oldProfile = before.layout[breakpoint] as Record<string, Record<string, unknown>>;
			const currentProfile = section.layout?.[breakpoint] as Record<string, Record<string, unknown>>;
			const oldFrame = oldProfile[outerFrameId], newFrame = currentProfile[outerFrameId];
			assert.ok(newFrame, `${section.id}:${breakpoint}:${outerFrameId} must remain present`);
			assert.deepEqual([newFrame.worldX, newFrame.worldY], [oldFrame.worldX, oldFrame.worldY], `${section.id}:${breakpoint} frame coordinates are unchanged`);
			if (breakpoint === 'desktop') assert.deepEqual([newFrame.worldX, newFrame.worldY, newFrame.width, newFrame.height], [oldFrame.worldX, oldFrame.worldY, oldFrame.width, oldFrame.height], `${section.id} desktop frame geometry is unchanged`);
			else {
				assert.deepEqual([newFrame.width, newFrame.height], [desktopFrame.width, desktopFrame.height], `${section.id}:${breakpoint} dimensions match desktop`);
			}
			for (const id of Object.keys(oldProfile)) {
				if (id === outerFrameId) continue;
				const current = currentProfile[id], previousGeometry = oldProfile[id];
				assert.ok(current, `${section.id}:${breakpoint}:${id} remains present`);
				assert.deepEqual([current.worldX, current.worldY, current.width, current.height], [previousGeometry.worldX, previousGeometry.worldY, previousGeometry.width, previousGeometry.height], `${section.id}:${breakpoint}:${id} was not moved or resized`);
			}
		}
	}
});

test('every outer frame has equal width and height across all three device profiles', async () => {
	const content = validateContent(JSON.parse(await readFile(contentPath, 'utf8')));
	for (const section of content.sections) {
		const id = sectionContentFrameId(section);
		const desktop = section.layout?.desktop?.[id];
		assert.ok(desktop, `${section.id}:${id} desktop profile exists`);
		for (const breakpoint of ['tablet', 'mobile'] as const) {
			const frame = section.layout?.[breakpoint]?.[id];
			assert.ok(frame, `${section.id}:${breakpoint}:${id} profile exists`);
			assert.equal(frame.width, desktop.width, `${section.id}:${breakpoint} width`);
			assert.equal(frame.height, desktop.height, `${section.id}:${breakpoint} height`);
		}
	}
});

test('new frames use independent map-world coordinates and keep geometry through style reset defaults', () => {
	const section = { id: 'home', pointId: 'p1', label: '', eyebrow: '', title: '', accent: '', description: '', cards: [], actions: [], layoutItems: [{ id: 'empty-frame', type: 'panel' as const, title: '', text: '' }], layout: { desktop: { 'nova-panel': { worldX: 100, worldY: 200, width: 500, height: 300 }, 'empty-frame': { worldX: 600, worldY: 800, width: 520, height: 320, coordinateSpace: 'world' as const } } } };
	const frame = elementLayout(section, 'empty-frame', 'custom-panel', 0, 1, 'desktop', { x: 500, y: 700 });
	assert.equal(frame.coordinateSpace, 'world'); assert.equal(frame.parentId, undefined);
	assert.deepEqual([frame.worldX, frame.worldY, frame.width, frame.height], [600, 800, 520, 320]);
});

test('home content resolves relative to its selected authored frame without moving either frame', () => {
	const section = {
		id: 'home', pointId: 'p1', label: '', eyebrow: '', title: 'Title', accent: '', description: '', cards: [{ title: 'Card', text: 'Body' }], actions: [],
		layoutRemoved: ['nova-panel'], layoutItems: [{ id: 'hand-placed-frame', type: 'panel' as const, title: '', text: '' }],
		layout: { desktop: {
			'nova-panel': { worldX: 100, worldY: 200, width: 900, height: 600, coordinateSpace: 'world' as const },
			'hand-placed-frame': { worldX: 1200, worldY: 800, width: 470, height: 320, coordinateSpace: 'world' as const },
			title: { worldX: 20, worldY: 18, width: 430, height: 34, coordinateSpace: 'parent' as const, parentId: 'hand-placed-frame' },
			'card-0': { worldX: 20, worldY: 90, width: 210, height: 180, coordinateSpace: 'parent' as const, parentId: 'hand-placed-frame' },
		} },
	};
	const title = elementLayout(section, 'title', 'title', 0, 1, 'desktop', { x: 0, y: 0 });
	assert.equal(title.parentId, 'hand-placed-frame');
	assert.deepEqual([title.worldX, title.worldY], [20, 18]);
	const card = elementLayout(section, 'card-0', 'card', 0, 1, 'desktop', { x: 0, y: 0 });
	assert.equal(card.parentId, 'hand-placed-frame');
	assert.deepEqual([card.worldX, card.worldY], [20, 90]);
});

test('Home AMF Client wordmark keeps its saved responsive world geometry and editable subtitle', async () => {
	const route = validateRoute(JSON.parse(await readFile(routePath, 'utf8')));
	const content = validateContent(JSON.parse(await readFile(contentPath, 'utf8')));
	const home = content.sections.find(section => section.id === 'home')!;
	const point = route.points.find(item => item.id === home.pointId)!;
	const item = home.layoutItems?.find(value => value.id === 'amf-worldmark');
	assert.deepEqual(item, { id: 'amf-worldmark', type: 'logo', title: 'AMF Client', text: 'Comfort. Control. Quality.', translations: { en: 'Comfort. Control. Quality.', ru: 'Комфорт. Контроль. Качество.', uk: 'Комфорт. Контроль. Якість.' } });
	const savedLogoProfiles = JSON.parse(await readFile(resolve('tests/fixtures/home-wordmark-layout.json'), 'utf8'));
	for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) assert.deepEqual(home.layout?.[breakpoint]?.['amf-worldmark'], savedLogoProfiles[breakpoint], `${breakpoint} logo geometry and styling remain unchanged`);
	assert.equal(item.title, 'AMF Client');
	assert.equal(layoutItemTranslation(item, 'en', translate('brand.wordmarkTagline', 'en')), 'Comfort. Control. Quality.');
	assert.equal(layoutItemTranslation(item, 'uk', translate('brand.wordmarkTagline', 'uk')), 'Комфорт. Контроль. Якість.');
	assert.equal(layoutItemTranslation(item, 'ru', translate('brand.wordmarkTagline', 'ru')), 'Комфорт. Контроль. Качество.');
	const beforeTranslationEdit = structuredClone(item);
	updateLayoutItemTranslation(item, 'ru', 'Комфорт. Контроль. Точность.');
	assert.deepEqual(item.translations, { en: beforeTranslationEdit.translations!.en, ru: 'Комфорт. Контроль. Точность.', uk: beforeTranslationEdit.translations!.uk });
	assert.equal(item.title, 'AMF Client');
	for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
		const profile = home.layout?.[breakpoint]?.['amf-worldmark'];
		assert.ok(profile, `${breakpoint} keeps a saved wordmark profile`);
		assert.equal(profile.coordinateSpace, 'world');
		assert.equal(typeof profile.worldX, 'number');
		assert.equal(typeof profile.worldY, 'number');
		assert.ok((profile.width ?? 0) > 0);
		assert.ok((profile.height ?? 0) > 0);
		assert.equal(profile.align, 'center');
		assert.equal(profile.opacity, 100);
		assert.equal(typeof profile.letterSpacing, 'number');
		assert.equal(typeof profile.subtitleFontSize, 'number');
		assert.equal(profile.subtitleColor, '#cbe8f7');
		assert.equal(typeof profile.subtitleFontWeight, 'number');
		assert.equal(typeof profile.subtitleGap, 'number');
		assert.equal(typeof profile.subtitleLetterSpacing, 'number');
		assert.equal(typeof profile.subtitleOpacity, 'number');
	}
	const savedDesktop = home.layout?.desktop?.['amf-worldmark']!;
	const savedX = Number(savedDesktop.worldX), savedY = Number(savedDesktop.worldY);
	assert.ok(Number.isFinite(savedX) && Number.isFinite(savedY));
	const desktop = elementLayout(home, 'amf-worldmark', 'custom-logo', 1, home.layoutItems!.length, 'desktop', { x: savedX, y: savedY });
	assert.equal(desktop.parentId, undefined);
	assert.equal(desktop.coordinateSpace, 'world');
	const width = 1920, height = 1080, aspect = width / height;
	const renderCamera = cameraWithVerticalOffset({ x: point.x, y: point.y, zoom: 1.1 }, aspect);
	const view = groupView(renderCamera, aspect, GAME_GROUP);
	const box = projectLayoutBox(desktop, view, width, height);
	const savedScreenPosition = worldToScreen({ x: savedX, y: savedY }, view, width, height);
	assert.ok(Math.abs(box.x + box.width / 2 - savedScreenPosition.x) < 1e-8);
	assert.ok(Math.abs(box.y - savedScreenPosition.y) < 1e-8);
	const main = await readFile(resolve('src/main.ts'), 'utf8');
	const editor = await readFile(resolve('src/content-editor.ts'), 'utf8');
	const styles = await readFile(resolve('src/style.css'), 'utf8');
	assert.match(main, /element\.className=`layout-custom layout-custom-logo amf-worldmark`/);
	assert.match(main, /className='amf-worldmark-title'/);
	assert.match(main, /className='amf-worldmark-subtitle'/);
	assert.match(main, /content\.append\(element\);\s*continue/);
	assert.match(editor, /'custom-logo'/);
	assert.match(editor, /'letterSpacing'/);
	assert.match(editor, /'opacity'/);
	assert.match(editor, /subtitleFontSize/);
	assert.match(editor, /subtitleColor/);
	assert.match(styles, /background-clip:text/);
	assert.match(styles, /#map-foreground\{z-index:3;pointer-events:none\}/);
	assert.match(styles, /amf-worldmark-subtitle/);
	assert.match(main, /foregroundRenderer\?\.draw\(renderCamera,time,entities\)/);
});

test('responsive profiles preserve independent world geometry and custom elements', () => {
	const base = { version: 1 as const, sections: [{ id: 'home', pointId: 'p1', label: 'Главная', eyebrow: '', title: '', accent: '', description: '', cards: [], actions: [], layout: { desktop: { card: { worldX: 100, worldY: 200, width: 400, height: 160 } }, mobile: { card: { worldX: 12, worldY: 24, width: 340, height: 130 } } }, layoutItems: [{ id: 'custom-one', type: 'card' as const, title: 'Своя карточка', text: 'Текст', sectionId: undefined }] }] };
	const checked = validateContent(base);
	assert.equal(checked.sections[0].layout?.desktop?.card?.worldX, 100);
	assert.equal(checked.sections[0].layout?.mobile?.card?.width, 340);
	assert.equal(checked.sections[0].layoutItems?.[0].title, 'Своя карточка');
});

test('saving materializes complete independent layouts for every default and custom object', () => {
	const section = {
		id: 'features', pointId: 'p1', label: 'Возможности', eyebrow: 'Раздел', title: 'Заголовок', accent: 'Акцент', subtitle: 'Подзаголовок', description: 'Описание',
		cards: [{ title: 'Карточка', text: 'Текст' }], actions: [{ label: 'Кнопка', sectionId: 'download' }],
		layoutItems: [{ id: 'custom-card', type: 'card' as const, title: 'Своя', text: 'Содержимое' }], layoutExtras: [{ id: 'copy-card', sourceId: 'card-0' }],
		layout: { desktop: { title: { worldX: 123, backgroundOpacity: 45 } } },
	};
	for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
		const profile = materializeSectionLayout(section, breakpoint, { x: 500, y: 700 });
		for (const id of ['nova-panel', 'eyebrow', 'title', 'subtitle', 'description', 'card-0', 'action-0', 'custom-card', 'copy-card']) {
			assert.ok(profile[id], `${breakpoint}:${id} should be materialized`);
			assert.equal(typeof profile[id]!.worldX, 'number');
			assert.equal(typeof profile[id]!.worldY, 'number');
			assert.equal(typeof profile[id]!.width, 'number');
			assert.equal(typeof profile[id]!.height, 'number');
			assert.equal(typeof profile[id]!.backgroundOpacity, 'number');
			assert.equal(typeof profile[id]!.fontFamily, 'string');
		}
	}
	const desktop = materializeSectionLayout(section, 'desktop', { x: 500, y: 700 });
	const mobile = materializeSectionLayout(section, 'mobile', { x: 500, y: 700 });
	assert.equal(desktop['nova-panel']?.coordinateSpace, 'world');
	assert.equal(desktop.title?.coordinateSpace, 'parent');
	assert.equal(desktop.title?.parentId, 'nova-panel');
	assert.equal(desktop.title?.worldX, 73);
	assert.equal(desktop.title?.backgroundOpacity, 45);
	assert.notEqual(desktop.title?.fontSize, mobile.title?.fontSize);
});

test('every section is mounted in the shared world layer and navigation only marks the selected tab', async () => {
	const main = await readFile(resolve('src/main.ts'), 'utf8');
	const styles = await readFile(resolve('src/style.css'), 'utf8');
	assert.match(main, /for\(const s of siteSections\)/);
	assert.match(main, /content\.append\(panel\)/);
	assert.match(main, /setAttribute\('aria-current'/);
	assert.doesNotMatch(main, /classList\.(?:add|remove|toggle)\(['"]is-active/);
	assert.doesNotMatch(styles, /section\.is-active/);
	assert.match(main, /layoutElement\(panel,authoredFrame\?\.id\?\?'nova-panel',authoredFrame\?'custom-panel':'panel'/);
	assert.match(main, /if\(item\.id===authoredFrame\?\.id\)continue/);
	assert.match(styles, /#world-space>\.nova-panel,#world-space>\.layout-custom-panel\{display:block!important/);
	assert.match(styles, /header nav \.nav-highlight/);
	assert.match(main, /if\(s\.eyebrow\|\|s\.title\|\|s\.accent\|\|s\.subtitle\|\|s\.description\)/);
	assert.doesNotMatch(main, /panel\.classList\.(?:add|remove|toggle)\(['"]is-active/);
});

test('editor selection frames stay transparent and cannot inherit primary button fill', async () => {
	const editor = await readFile(resolve('src/content-editor.ts'), 'utf8');
	const styles = await readFile(resolve('src/editor.css'), 'utf8');
	assert.match(editor, /layout-selection-frame\$\{selectionIndex === 0 \? ' is-primary' : ' is-secondary'\}/);
	assert.match(styles, /\.layout-selection-frame\.is-primary\{[^}]*background:transparent!important/);
	assert.match(styles, /\.layout-selection-frame\.is-secondary\{[^}]*background:transparent!important/);
});

test('HTML map-space projection uses the renderer view, zoom, and approved 13% camera offset', () => {
	const width = 1920, height = 1080, camera = { x: 2800, y: 1400, zoom: 1.1 };
	const renderCamera = cameraWithVerticalOffset(camera, width / height);
	const view = groupView(renderCamera, width / height, GAME_GROUP);
	const screen = worldToScreen({ x: camera.x, y: camera.y }, view, width, height);
	assert.ok(Math.abs(screen.x - width / 2) < 1e-8);
	assert.ok(Math.abs(screen.y - height * 0.63) < 1e-8);
	const roundTrip = screenToWorld(screen, view, width, height);
	assert.ok(Math.abs(roundTrip.x - camera.x) < 1e-8);
	assert.ok(Math.abs(roundTrip.y - camera.y) < 1e-8);
	assert.equal(worldTransform(view, width, height), `matrix(${width / view.width},0,0,${height / view.height},${-view.x * width / view.width},${-view.y * height / view.height})`);
});

test('projected layout boxes use crisp CSS-pixel geometry for world and parent-relative content', () => {
	const view = { x: 100, y: 200, width: 1600, height: 900 }, viewportWidth = 2560, viewportHeight = 1440;
	const world = projectLayoutBox({ worldX: 300, worldY: 420, width: 500, height: 180, align: 'left', coordinateSpace: 'world' }, view, viewportWidth, viewportHeight);
	assert.deepEqual([world.x, world.y, world.width, world.height], [320, 352, 800, 288]);
	const child = projectLayoutBox({ worldX: 24, worldY: 32, width: 240, height: 80, align: 'left', coordinateSpace: 'parent' }, view, viewportWidth, viewportHeight);
	assert.ok(Math.abs(child.x - 38.4) < 1e-10);
	assert.ok(Math.abs(child.y - 51.2) < 1e-10);
	assert.deepEqual([child.width, child.height], [384, 128]);
	assert.ok(Math.abs(child.scale - 1.6) < 1e-12);
	const centered = projectLayoutBox({ worldX: 900, worldY: 200, width: 200, height: 100, align: 'center', coordinateSpace: 'world' }, view, viewportWidth, viewportHeight);
	assert.equal(centered.x + centered.width / 2, 1280);
});

test('map-space projection avoids scaling the shared text layer and keeps hover motion smooth', async () => {
	const main = await readFile(resolve('src/main.ts'), 'utf8');
	const styles = await readFile(resolve('src/style.css'), 'utf8');
	assert.match(main, /world\.style\.transform='none'/);
	assert.match(main, /applyWorldProjection\(element,view,width,height\)/);
	assert.match(styles, /#world-space\{transform:none!important/);
	assert.match(styles, /#world-space \.feature-list article\{[^}]*transition:transform 300ms cubic-bezier\(\.22,1,\.36,1\)/);
	assert.match(styles, /body\.layout-edit-mode #world-space \.feature-list article,body\.layout-edit-mode #world-space \.feature-list article:hover\{transform:none!important/);
	assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[^}]*#world-space \.feature-list article/);
});

test('layout persistence rejects non-finite geometry and executable gradients', () => {
	const base = { version: 1, sections: [{ id: 'home', pointId: 'p1', label: '', eyebrow: '', title: '', accent: '', description: '', cards: [], actions: [], layout: { desktop: { title: { worldX: Number.NaN } } } }] };
	assert.throws(() => validateContent(base), /Некорректное значение worldX/);
	const unsafe = { version: 1, sections: [{ id: 'home', pointId: 'p1', label: '', eyebrow: '', title: '', accent: '', description: '', cards: [], actions: [], layout: { desktop: { title: { worldX: 10, gradient: 'url(https://example.invalid)' } } } }] };
	assert.throws(() => validateContent(unsafe), /Некорректный градиент/);
});
