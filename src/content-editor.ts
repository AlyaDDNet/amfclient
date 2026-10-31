import { applyElementLayout, currentBreakpoint, defaultElementLayout, elementLayout, LAYOUT_BREAKPOINTS, materializeSectionLayout, PANEL_LAYOUT_ID, sectionContentFrameId, type ElementLayout, type LayoutBreakpoint, type LayoutExtra, type LayoutItem, type LayoutItemType, type WorldAnchor } from './site-layout';
import { validateContent, type SiteContent, type SiteSection } from './site-content';
import type { RouteConfig } from './route';
import type { Camera } from './map/renderer';
import { sectionLabel } from './i18n';

interface Entry { section: SiteSection; element: HTMLElement; id: string; role: string; index: number }
interface Selection { sectionId: string; id: string }
interface DragItem { entry: Entry; layout: ElementLayout; start: DOMPoint }
interface DragState { pointerId: number; target: HTMLElement; kind: 'move' | 'resize'; handle?: string; items: DragItem[]; before: SiteContent; moved: boolean }
interface ContentEditorHandle { update(): void; dispose(): void }
const KEY_SEPARATOR = '\u0000';
const keyOf = (selection: Selection) => `${selection.sectionId}${KEY_SEPARATOR}${selection.id}`;
const safeHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : '#173148';
const wordmarkGradient = (color: string) => {
	const channel = (offset: number, amount: number) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, '0');
	const tint = (amount: number) => `#${channel(1, amount)}${channel(3, amount)}${channel(5, amount)}`;
	return `linear-gradient(108deg, ${tint(.68)} 0%, ${tint(.48)} 48%, ${tint(.18)} 100%)`;
};

export function mountContentEditor(initial: SiteContent, getRoute: () => RouteConfig, getCamera: () => Camera, changed: (content: SiteContent, rebuild?: boolean) => void, preview: () => void): ContentEditorHandle {
	let draft = validateContent(initial);
	let selected: Selection[] = [];
	let breakpoint = currentBreakpoint();
	let drag: DragState | undefined;
	let transactionBefore: SiteContent | undefined;
	let transactionTimer = 0;
	let undoStack: SiteContent[] = [], redoStack: SiteContent[] = [];
	let lastStatus = '';
	const removers: (() => void)[] = [];
	const panel = document.createElement('aside');
	panel.id = 'content-layout-editor';
	panel.setAttribute('aria-label', 'Редактор элементов сайта');
	panel.innerHTML = `
		<div class="layout-editor-heading"><div><span class="layout-local-tag">NOVA · WORLD SPACE</span><h2>Элементы сайта</h2></div><button type="button" data-command="preview" title="Предпросмотр сайта без инструментов">Предпросмотр</button></div>
		<p class="layout-editor-note">Блоки закреплены в координатах DDNet-карты. Навигация перемещает только камеру. Перетаскивайте объект мышью; размер меняется восемью маркерами.</p>
		<label class="layout-field">Редактируемый раздел<select data-ui="section"></select></label>
		<div class="layout-breakpoints" role="group" aria-label="Адаптивная раскладка">
			<button type="button" data-breakpoint="desktop">Desktop</button><button type="button" data-breakpoint="tablet">Tablet</button><button type="button" data-breakpoint="mobile">Mobile</button>
		</div>
		<label class="layout-field">Новая рамка<select data-ui="new-type"><option value="panel">Пустая внешняя рамка</option></select></label>
		<div class="layout-command-grid">
			<button type="button" data-command="add">Создать пустую рамку</button><button type="button" data-command="duplicate">Дублировать</button>
			<button type="button" data-command="visibility">Скрыть / показать</button><button type="button" data-command="delete">Удалить / восстановить</button>
			<button type="button" data-command="group">Группировать</button><button type="button" data-command="ungroup">Разгруппировать</button>
			<button type="button" data-command="front">На передний план</button><button type="button" data-command="back">На задний план</button>
			<button type="button" data-command="undo">Отменить</button><button type="button" data-command="redo">Повторить</button>
			<button type="button" data-command="reset">Сбросить стиль</button><button type="button" data-command="restore">Восстановить копию</button>
		</div>
		<div class="layout-toolbar"><button type="button" data-command="save">Сохранить раскладку</button><button type="button" data-command="reload">Загрузить JSON</button></div>
		<output data-ui="status" aria-live="polite">Загрузка раскладки…</output>
		<div class="layout-list-wrap"><h3>Элементы раздела</h3><div class="layout-element-list" data-ui="list"></div></div>
		<div class="layout-properties" data-ui="properties"><p class="layout-empty">Выберите элемент на карте или в списке.</p></div>`;
	const overlay = document.createElement('div');
	overlay.id = 'layout-selection-overlay';
	overlay.setAttribute('aria-hidden', 'true');
	document.body.append(panel, overlay);

	const query = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
	const currentSectionId = () => query<HTMLSelectElement>('[data-ui="section"]').value || draft.sections[0]?.id || '';
	const currentSection = () => draft.sections.find(section => section.id === currentSectionId()) ?? draft.sections[0];
	const status = (message: string, error = false) => { lastStatus = message; const node = query<HTMLOutputElement>('[data-ui="status"]'); node.textContent = message; node.dataset.error = String(error); };
	const notifyChange = (rebuild = false) => changed(draft, rebuild);
	const routeAnchor = (section: SiteSection): WorldAnchor => {
		const point = getRoute().points.find(item => item.id === section.pointId) ?? getRoute().points[0] ?? getCamera();
		return { x: point.x, y: point.y };
	};
	const entriesFor = (sectionId = currentSectionId()): Entry[] => {
		const section = draft.sections.find(item => item.id === sectionId);
		if (!section) return [];
		return [...document.querySelectorAll<HTMLElement>('#world-space [data-layout-id]')]
			.filter(element => element.dataset.layoutSection === sectionId)
			.map(element => ({ section, element, id: element.dataset.layoutId!, role: element.dataset.layoutRole ?? 'description', index: Number(element.dataset.layoutIndex ?? 0) }));
	};
	const allEntries = () => draft.sections.flatMap(section => entriesFor(section.id));
	const findEntry = (selection: Selection) => entriesFor(selection.sectionId).find(entry => entry.id === selection.id);
	const layoutFor = (entry: Entry, bp = breakpoint): ElementLayout => elementLayout(entry.section, entry.id, entry.role, entry.index, entry.role === 'card' ? entry.section.cards.length : entry.role === 'action' ? entry.section.actions.length : entry.role.startsWith('custom-') ? (entry.section.layoutItems?.length ?? 1) : 1, bp, routeAnchor(entry.section));
	const storeLayout = (entry: Entry, layout: ElementLayout, bp = breakpoint) => {
		entry.section.layout ??= {};
		entry.section.layout[bp] ??= {};
		entry.section.layout[bp]![entry.id] = structuredClone(layout);
	};
	const applyEntry = (entry: Entry, layout = layoutFor(entry)) => applyElementLayout(entry.element, layout, breakpoint);
	const setSelection = (next: Selection[], additive = false) => {
		const unique = [...new Map(next.map(item => [keyOf(item), item])).values()];
		selected = additive ? [...selected, ...unique].filter((item, index, all) => all.findIndex(other => keyOf(other) === keyOf(item)) === index) : unique;
		renderList(); renderProperties(); update();
	};
	const beginTransaction = () => { if (!transactionBefore) transactionBefore = structuredClone(draft); window.clearTimeout(transactionTimer); };
	const finishTransaction = () => {
		if (!transactionBefore) return;
		undoStack.push(transactionBefore); if (undoStack.length > 80) undoStack.shift(); redoStack = []; transactionBefore = undefined;
		refreshCommandState();
	};
	const scheduleFinishTransaction = () => { window.clearTimeout(transactionTimer); transactionTimer = window.setTimeout(finishTransaction, 650); };
	const commitDiscrete = (before: SiteContent) => { undoStack.push(before); if (undoStack.length > 80) undoStack.shift(); redoStack = []; refreshCommandState(); };
	const updateContentField = (entry: Entry, field: string, value: string) => {
		const section = entry.section;
		if (entry.element.dataset.layoutExtra === 'true') {
			const extra = section.layoutExtras?.find(item => item.id === entry.id);
			if (extra) Object.assign(extra, { [field]: value });
		} else if (entry.element.dataset.layoutCustom === 'true') {
			const item = section.layoutItems?.find(item => item.id === entry.id);
			if (item) Object.assign(item, { [field]: value });
		} else if (entry.role === 'title' && field === 'title') section.title = value;
		else if (entry.role === 'title' && field === 'accent') section.accent = value;
		else if (entry.role === 'eyebrow' && field === 'text') section.eyebrow = value;
		else if (entry.role === 'subtitle' && field === 'text') section.subtitle = value;
		else if (entry.role === 'description' && field === 'text') section.description = value;
		else if (entry.role === 'card') {
			const card = section.cards[entry.index]; if (card) Object.assign(card, { [field]: value });
		} else if (entry.role === 'action') {
			const action = section.actions[entry.index]; if (action) Object.assign(action, { [field]: value });
		}
		const element = entry.element;
		if (field === 'title' && element.dataset.layoutCustom === 'true' && entry.role === 'custom-button') element.textContent = value;
		else if (field === 'href' && element.dataset.layoutCustom === 'true' && element instanceof HTMLAnchorElement) element.href = value;
		else if (field === 'title' && element.dataset.layoutCustom === 'true') { const heading = element.querySelector('h3'); if (heading) heading.textContent = value; }
		else if (field === 'text' && element.dataset.layoutCustom === 'true') { const paragraph = element.querySelector('p'); if (paragraph) paragraph.textContent = value; }
		else if (field === 'title' && entry.element.dataset.layoutExtra === 'true') { const heading = element.matches('h1,h2,h3') ? element : element.querySelector('h3'); if (heading) heading.textContent = value; }
		else if (field === 'text' && entry.element.dataset.layoutExtra === 'true') { const paragraph = element.querySelector('p'); if (paragraph) paragraph.textContent = value; }
		else if (field === 'label' && entry.element.dataset.layoutExtra === 'true') { const label = element.querySelector('.action-label'); if (label) label.textContent = value; else element.textContent = value; }
		else if (entry.role === 'title') { const accent = element.querySelector('em'); if (field === 'title' && element.firstChild) element.firstChild.textContent = `${section.title} `; if (field === 'accent' && accent) accent.textContent = section.accent; }
		else if (entry.role === 'eyebrow' && field === 'text') element.textContent = value;
		else if (entry.role === 'subtitle' && field === 'text') element.textContent = value;
		else if (entry.role === 'description' && field === 'text') element.textContent = value;
		else if (entry.role === 'card') { const heading = element.querySelector('h3'), paragraph = element.querySelector('p'); if (field === 'title' && heading) heading.textContent = value; if (field === 'text' && paragraph) paragraph.textContent = value; }
		else if (entry.role === 'action') { if (field === 'label') { const label = element.querySelector('.action-label'); if (label) label.textContent = value; else element.textContent = value; } if (field === 'href' && element instanceof HTMLAnchorElement) element.href = value; }
		notifyChange(false);
	};
	const propertyInput = (label: string, key: keyof ElementLayout, value: string | number, type = 'text', min?: number, max?: number, step?: number) => {
		const wrap = document.createElement('label'); wrap.className = 'layout-field';
		const caption = document.createElement('span'); caption.textContent = label;
		const input = document.createElement('input'); input.type = type; input.dataset.layoutProperty = String(key); input.value = String(value);
		if (min !== undefined) input.min = String(min); if (max !== undefined) input.max = String(max); if (step !== undefined) input.step = String(step);
		wrap.append(caption, input); return wrap;
	};
	const textInput = (label: string, field: string, value: string, multiline = false, type = 'text') => {
		const wrap = document.createElement('label'); wrap.className = 'layout-field layout-text-field';
		const caption = document.createElement('span'); caption.textContent = label;
		const input = document.createElement(multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
		if (input instanceof HTMLInputElement) input.type = type;
		input.dataset.contentProperty = field; input.value = value;
		wrap.append(caption, input); return wrap;
	};
	const layoutTextInput = (label: string, key: keyof ElementLayout, value: string) => {
		const wrap = document.createElement('label'); wrap.className = 'layout-field layout-text-field';
		const caption = document.createElement('span'); caption.textContent = label;
		const input = document.createElement('input'); input.type = 'text'; input.dataset.layoutProperty = String(key); input.value = value;
		wrap.append(caption, input); return wrap;
	};
	const selectInput = <T extends string>(label: string, key: string, value: T, options: T[]) => {
		const wrap = document.createElement('label'); wrap.className = 'layout-field'; const caption = document.createElement('span'); caption.textContent = label;
		const input = document.createElement('select'); input.dataset.layoutProperty = key; for (const option of options) { const item = document.createElement('option'); item.value = option; item.textContent = option; input.append(item); } input.value = value; wrap.append(caption, input); return wrap;
	};
	const renderList = () => {
		const list = query<HTMLDivElement>('[data-ui="list"]'); list.replaceChildren();
		for (const entry of entriesFor()) {
			const item = document.createElement('button'); item.type = 'button'; item.className = 'layout-list-item'; item.classList.toggle('selected', selected.some(selection => keyOf(selection) === keyOf({ sectionId: entry.section.id, id: entry.id })));
			item.dataset.selectId = entry.id;
			const role = entry.role === 'panel' || entry.role === 'custom-panel' ? 'Внешняя рамка' : entry.role === 'custom-logo' ? 'Логотип' : entry.element.dataset.layoutCustom === 'true' ? 'Новый элемент' : entry.role === 'card' ? 'Карточка' : entry.role === 'action' ? 'Кнопка' : entry.role === 'title' ? 'Заголовок' : entry.role;
			const title = entry.element.dataset.layoutCustom === 'true' ? entry.element.querySelector('h3')?.textContent ?? entry.element.textContent : entry.element.querySelector('h3')?.textContent ?? entry.element.textContent;
			item.textContent = `${role}: ${(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 38)}`;
			if (entry.element.dataset.layoutHidden === 'true') item.classList.add('hidden-layout-item');
			if (entry.element.dataset.layoutRemoved === 'true') item.classList.add('removed-layout-item');
			item.addEventListener('click', event => { const add = (event as MouseEvent).shiftKey || (event as MouseEvent).ctrlKey; setSelection([{ sectionId: entry.section.id, id: entry.id }], add); });
			list.append(item);
		}
	};
	const contentFields = (entry: Entry, container: HTMLElement) => {
		const section = entry.section, extra = section.layoutExtras?.find(item => item.id === entry.id);
		if (entry.element.dataset.layoutCustom === 'true') {
			const item = section.layoutItems?.find(value => value.id === entry.id); if (!item || item.type === 'panel') return;
			if (item.type === 'logo') { const note = document.createElement('p'); note.className = 'layout-empty'; note.textContent = 'AMF Client остаётся названием бренда. Слоган редактируется отдельно и перемещается вместе с логотипом.'; container.append(note, textInput('Слоган', 'text', item.text)); return; }
			container.append(textInput('Заголовок / подпись', 'title', item.title), textInput('Текст', 'text', item.text, true));
			if (item.type === 'button') { container.append(textInput('URL (HTTPS)', 'href', item.href ?? '')); const target = document.createElement('label'); target.className = 'layout-field'; target.append(document.createTextNode('Раздел камеры')); const select = document.createElement('select'); select.dataset.customSection = ''; const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Без перехода'; select.append(empty); for (const itemSection of draft.sections) { const option = document.createElement('option'); option.value = itemSection.id; option.textContent = itemSection.label; select.append(option); } select.value = item.sectionId ?? ''; target.append(select); container.append(target); }
			return;
		}
		if (extra) {
			if (entry.role === 'card' || entry.role.startsWith('custom-')) container.append(textInput('Заголовок', 'title', extra.title ?? entry.element.querySelector('h3')?.textContent ?? ''));
			if (entry.role === 'card' || entry.role.startsWith('custom-')) container.append(textInput('Текст', 'text', extra.text ?? entry.element.querySelector('p')?.textContent ?? '', true));
			if (entry.role === 'action') container.append(textInput('Надпись', 'label', extra.label ?? entry.element.textContent ?? ''));
			return;
		}
		if (entry.role === 'title') container.append(textInput('Заголовок', 'title', section.title), textInput('Акцент', 'accent', section.accent));
		else if (entry.role === 'eyebrow') container.append(textInput('Надпись', 'text', section.eyebrow));
		else if (entry.role === 'subtitle') container.append(textInput('Подзаголовок', 'text', section.subtitle ?? '', true));
		else if (entry.role === 'description') container.append(textInput('Описание', 'text', section.description, true));
		else if (entry.role === 'card') { const card = section.cards[entry.index]; if (card) container.append(textInput('Заголовок карточки', 'title', card.title), textInput('Текст карточки', 'text', card.text, true)); }
		else if (entry.role === 'action') { const action = section.actions[entry.index]; if (action) container.append(textInput('Текст кнопки', 'label', action.label), ...(action.href ? [textInput('URL (HTTPS)', 'href', action.href)] : [])); }
	};
	const renderProperties = () => {
		const properties = query<HTMLDivElement>('[data-ui="properties"]'); properties.replaceChildren();
		const selection = selected[0], entry = selection && findEntry(selection);
		if (!entry) { const empty = document.createElement('p'); empty.className = 'layout-empty'; empty.textContent = 'Выберите элемент на карте или в списке.'; properties.append(empty); refreshCommandState(); return; }
		const title = document.createElement('h3'); title.textContent = `${entry.section.label} · ${entry.id}`; properties.append(title);
		const geom = document.createElement('details'); geom.open = true; const geomSummary = document.createElement('summary'); geomSummary.textContent = 'Положение и размер'; geom.append(geomSummary);
		const layout = layoutFor(entry), rootPanel = entry.id === PANEL_LAYOUT_ID || layout.coordinateSpace === 'world';
		geom.append(propertyInput(rootPanel ? 'Мировой X' : 'X внутри панели', 'worldX', layout.worldX, 'number', -10000000, 10000000, 1), propertyInput(rootPanel ? 'Мировой Y' : 'Y внутри панели', 'worldY', layout.worldY, 'number', -10000000, 10000000, 1), propertyInput('Ширина', 'width', layout.width, 'number', 1, 1000000, 1), propertyInput('Высота', 'height', layout.height, 'number', 1, 1000000, 1), propertyInput('Z-index', 'zIndex', layout.zIndex, 'number', -1000, 1000, 1), selectInput('Выравнивание блока', 'align', layout.align, ['left', 'center', 'right']), selectInput('Выравнивание текста', 'textAlign', layout.textAlign, ['left', 'center', 'right']));
		properties.append(geom);
		const appearance = document.createElement('details'); appearance.open = true; const appearanceSummary = document.createElement('summary'); appearanceSummary.textContent = 'Внешний вид'; appearance.append(appearanceSummary);
		if (entry.role === 'custom-logo') {
			appearance.append(propertyInput('Базовый цвет и тон свечения', 'color', safeHex(layout.color), 'color'), propertyInput('Непрозрачность текста, %', 'opacity', layout.opacity ?? 100, 'range', 0, 100, 1), layoutTextInput('Градиент букв', 'gradient', layout.gradient), propertyInput('Цвет слогана', 'subtitleColor', safeHex(layout.subtitleColor ?? '#cbe8f7'), 'color'), propertyInput('Непрозрачность слогана, %', 'subtitleOpacity', layout.subtitleOpacity ?? 92, 'range', 0, 100, 1), propertyInput('Деликатное свечение, %', 'glowIntensity', layout.glowIntensity, 'range', 0, 100, 1));
		} else {
			appearance.append(propertyInput('Цвет фона', 'background', safeHex(layout.background), 'color'), propertyInput('Прозрачность, %', 'backgroundOpacity', layout.backgroundOpacity, 'range', 0, 100, 1), propertyInput('Размытие, px', 'blur', layout.blur, 'range', 0, 24, 1), layoutTextInput('CSS gradient', 'gradient', layout.gradient), propertyInput('Цвет рамки', 'borderColor', safeHex(layout.borderColor), 'color'), propertyInput('Толщина рамки', 'borderWidth', layout.borderWidth, 'number', 0, 8, 0.2), propertyInput('Скругление', 'radius', layout.radius, 'number', 0, 80, 1), propertyInput('Цвет тени', 'shadowColor', safeHex(layout.shadowColor), 'color'), propertyInput('Внешняя тень, %', 'shadowIntensity', layout.shadowIntensity, 'range', 0, 100, 1), propertyInput('Внутренняя тень, %', 'innerShadowIntensity', layout.innerShadowIntensity, 'range', 0, 100, 1), propertyInput('Свечение контура, %', 'glowIntensity', layout.glowIntensity, 'range', 0, 100, 1), propertyInput('Внутренний отступ', 'padding', layout.padding, 'number', 0, 100, 1));
		}
		properties.append(appearance);
		const typography = document.createElement('details'); const typographySummary = document.createElement('summary'); typographySummary.textContent = 'Типографика'; typography.append(typographySummary);
		typography.append(propertyInput('Размер шрифта', 'fontSize', layout.fontSize, 'number', 6, 160, 1), layoutTextInput('Семейство шрифта', 'fontFamily', layout.fontFamily), propertyInput('Толщина', 'fontWeight', layout.fontWeight, 'number', 100, 900, 50), ...(entry.role === 'custom-logo' ? [] : [propertyInput('Цвет текста', 'color', safeHex(layout.color), 'color')]), propertyInput('Межстрочный интервал', 'lineHeight', layout.lineHeight, 'number', 0.7, 3, 0.05));
		if (entry.role === 'custom-logo') typography.append(propertyInput('Межбуквенный интервал', 'letterSpacing', layout.letterSpacing ?? 0, 'number', -20, 50, 0.1), propertyInput('Размер слогана', 'subtitleFontSize', layout.subtitleFontSize ?? 16, 'number', 6, 100, 1), propertyInput('Толщина слогана', 'subtitleFontWeight', layout.subtitleFontWeight ?? 560, 'number', 100, 900, 50), propertyInput('Отступ от логотипа', 'subtitleGap', layout.subtitleGap ?? 6, 'number', 0, 80, 1), propertyInput('Межбуквенный интервал слогана', 'subtitleLetterSpacing', layout.subtitleLetterSpacing ?? .45, 'number', -5, 20, .1));
		properties.append(typography);
		const content = document.createElement('details'); content.open = true; const contentSummary = document.createElement('summary'); contentSummary.textContent = 'Содержимое'; content.append(contentSummary); contentFields(entry, content); properties.append(content);
		for (const input of properties.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-layout-property],[data-content-property],[data-custom-section]')) {
			input.addEventListener('focus', beginTransaction);
			input.addEventListener('input', () => {
				beginTransaction(); const active = selected[0] && findEntry(selected[0]); if (!active) return;
				if (input.dataset.layoutProperty) {
					const key = input.dataset.layoutProperty as keyof ElementLayout, next = layoutFor(active);
					if (['worldX', 'worldY', 'width', 'height', 'zIndex', 'backgroundOpacity', 'blur', 'borderWidth', 'radius', 'shadowIntensity', 'innerShadowIntensity', 'glowIntensity', 'padding', 'fontSize', 'fontWeight', 'lineHeight', 'opacity', 'letterSpacing', 'subtitleFontSize', 'subtitleFontWeight', 'subtitleGap', 'subtitleLetterSpacing', 'subtitleOpacity'].includes(String(key))) {
						const number = Number(input.value); if (!Number.isFinite(number)) return; (next as unknown as Record<string, unknown>)[key] = number;
					} else if (key === 'background' || key === 'borderColor' || key === 'shadowColor' || key === 'color' || key === 'subtitleColor') {
						const color = safeHex(input.value); (next as unknown as Record<string, unknown>)[key] = color;
						if (key === 'color' && active.role === 'custom-logo') { next.gradient = wordmarkGradient(color); const gradientInput = properties.querySelector<HTMLInputElement>('[data-layout-property="gradient"]'); if (gradientInput) gradientInput.value = next.gradient; }
					}
					else if (key === 'gradient' || key === 'fontFamily') (next as unknown as Record<string, unknown>)[key] = input.value;
					else if (key === 'align' || key === 'textAlign') (next as unknown as Record<string, unknown>)[key] = input.value;
					storeLayout(active, next); applyEntry(active, next); notifyChange(false); update();
				} else if (input.dataset.contentProperty) {
					const value = input.value, field = input.dataset.contentProperty;
					if (field === 'href' && value && !/^https:\/\//i.test(value)) return;
					updateContentField(active, field, value);
				} else if (input.dataset.customSection) {
					const item = active.section.layoutItems?.find(value => value.id === active.id); if (item) { item.sectionId = input.value || undefined; if (active.element instanceof HTMLButtonElement) active.element.dataset.section = input.value || active.section.id; notifyChange(false); }
				}
				scheduleFinishTransaction();
			});
			input.addEventListener('change', finishTransaction);
			input.addEventListener('blur', finishTransaction);
		}
		refreshCommandState();
	};
	const refreshCommandState = () => {
		for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-command]')) {
			const command = button.dataset.command;
			if (command === 'undo') button.disabled = !undoStack.length;
			else if (command === 'redo') button.disabled = !redoStack.length;
			else if (['duplicate', 'visibility', 'group', 'ungroup', 'front', 'back', 'reset', 'delete'].includes(command ?? '')) button.disabled = !selected.length;
		}
		for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-breakpoint]')) button.setAttribute('aria-pressed', String(button.dataset.breakpoint === breakpoint));
	};
	const renderSectionChoices = () => {
		const select = query<HTMLSelectElement>('[data-ui="section"]'); const old = select.value; select.replaceChildren();
		for (const section of draft.sections) { const option = document.createElement('option'); option.value = section.id; option.textContent = sectionLabel(section.id, section.label); select.append(option); }
		select.value = draft.sections.some(section => section.id === old) ? old : draft.sections[0]?.id ?? '';
	};
	const syncLayoutMode = () => {
		const enabled = document.body.classList.contains('editing') && !document.body.classList.contains('editor-preview');
		document.body.classList.toggle('layout-edit-mode', enabled);
		panel.hidden = !enabled;
		overlay.hidden = !enabled;
		if (enabled) { renderList(); update(); }
	};
	const observer = new MutationObserver(syncLayoutMode); observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
	const matrix = () => {
		const transform = document.querySelector<HTMLElement>('#world-space')!.dataset.worldTransform ?? '';
		return transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : new DOMMatrixReadOnly();
	};
	const screenToWorld = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(matrix().inverse());
	const screenToEntrySpace = (entry: Entry, x: number, y: number) => {
		const point = screenToWorld(x, y), layout = layoutFor(entry);
		if (layout.coordinateSpace === 'parent' && layout.parentId) {
			const parent = findEntry({ sectionId: entry.section.id, id: layout.parentId });
			if (parent) { const parentLayout = layoutFor(parent); point.x -= parentLayout.worldX; point.y -= parentLayout.worldY; }
		}
		return point;
	};
	const effectiveBox = (layout: ElementLayout) => {
		const left = layout.worldX - (layout.align === 'center' ? layout.width / 2 : layout.align === 'right' ? layout.width : 0);
		return { left, top: layout.worldY, right: left + layout.width, bottom: layout.worldY + layout.height };
	};
	const writeDragLayouts = (state: DragState, clientX: number, clientY: number) => {
		let moved = false;
		for (const item of state.items) {
			const point = screenToEntrySpace(item.entry, clientX, clientY);
			const dx = point.x - item.start.x, dy = point.y - item.start.y;
			const next = structuredClone(item.layout);
			if (state.kind === 'move') { next.worldX += dx; next.worldY += dy; }
			else {
				const box = effectiveBox(item.layout), handle = state.handle ?? 'se';
				let left = box.left, right = box.right, top = box.top, bottom = box.bottom;
				if (handle.includes('w')) left = Math.min(point.x, right - 8); if (handle.includes('e')) right = Math.max(point.x, left + 8);
				if (handle.includes('n')) top = Math.min(point.y, bottom - 8); if (handle.includes('s')) bottom = Math.max(point.y, top + 8);
				next.width = Math.min(1000000, Math.max(8, right - left)); next.height = Math.min(1000000, Math.max(8, bottom - top));
				next.worldX = left + (next.align === 'center' ? next.width / 2 : next.align === 'right' ? next.width : 0); next.worldY = top;
			}
			storeLayout(item.entry, next); applyEntry(item.entry, next);
			moved ||= Math.abs(dx) + Math.abs(dy) > 0.25;
		}
		state.moved ||= moved;
		notifyChange(false); update();
	};
	const startDrag = (event: PointerEvent, kind: 'move' | 'resize', handle?: string, captureTarget?: HTMLElement) => {
		const entries = selected.map(findEntry).filter((entry): entry is Entry => !!entry);
		if (!entries.length) return;
		const groupIds = new Set(entries.map(entry => layoutFor(entry).groupId).filter((id): id is string => !!id));
		if (kind === 'move' && groupIds.size) {
			for (const entry of allEntries().filter(item => { const id = layoutFor(item).groupId; return id && groupIds.has(id); })) if (!entries.includes(entry)) entries.push(entry);
		}
		const target = captureTarget ?? event.currentTarget as HTMLElement;
		target.setPointerCapture?.(event.pointerId);
		drag = { pointerId: event.pointerId, target, kind, handle, items: entries.map(entry => ({ entry, layout: structuredClone(layoutFor(entry)), start: screenToEntrySpace(entry, event.clientX, event.clientY) })), before: structuredClone(draft), moved: false };
		event.preventDefault(); event.stopPropagation();
	};
	const pointerDownOnWorld = (event: PointerEvent) => {
		if (!document.body.classList.contains('layout-edit-mode') || event.button !== 0) return;
		const target = (event.target as Element).closest<HTMLElement>('#world-space [data-layout-id]'); if (!target) return;
		const selection = { sectionId: target.dataset.layoutSection!, id: target.dataset.layoutId! };
		const isAlreadySelected = selected.some(item => keyOf(item) === keyOf(selection));
		if (!isAlreadySelected) setSelection([selection], event.shiftKey || event.ctrlKey);
		else { renderProperties(); update(); }
		if (target.dataset.layoutHidden === 'true') { event.preventDefault(); event.stopPropagation(); return; }
		if (event.shiftKey || event.ctrlKey) return;
		startDrag(event, 'move', undefined, target);
	};
	const pointerDownOnOverlay = (event: PointerEvent) => {
		if (!document.body.classList.contains('layout-edit-mode') || event.button !== 0) return;
		const handle = (event.target as Element).closest<HTMLElement>('[data-resize-handle]'); if (!handle) return;
		startDrag(event, 'resize', handle.dataset.resizeHandle);
	};
	const pointerMove = (event: PointerEvent) => { if (drag?.pointerId === event.pointerId) writeDragLayouts(drag, event.clientX, event.clientY); };
	const pointerEnd = (event: PointerEvent) => {
		if (!drag || drag.pointerId !== event.pointerId) return;
		const state = drag; drag = undefined;
		if (state.target.hasPointerCapture?.(event.pointerId)) state.target.releasePointerCapture(event.pointerId);
		if (state.moved) { commitDiscrete(state.before); status('Мировые координаты и размеры обновлены. Не забудьте сохранить.'); }
	};
	const update = () => {
		overlay.replaceChildren();
		if (panel.hidden || overlay.hidden) return;
		for (const [selectionIndex, selection] of selected.entries()) {
			const entry = findEntry(selection); if (!entry) continue;
			const rect = entry.element.getBoundingClientRect(); if (!rect.width || !rect.height) continue;
			const frame = document.createElement('div'); frame.className = `layout-selection-frame${selectionIndex === 0 ? ' is-primary' : ' is-secondary'}`;
			frame.style.left = `${rect.left}px`; frame.style.top = `${rect.top}px`; frame.style.width = `${rect.width}px`; frame.style.height = `${rect.height}px`;
			if (selectionIndex === 0) for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) { const button = document.createElement('button'); button.type = 'button'; button.className = `resize-handle handle-${handle}`; button.dataset.resizeHandle = handle; button.setAttribute('aria-label', `Изменить размер: ${handle}`); frame.append(button); }
			overlay.append(frame);
		}
	};
	const selectBreakpoint = (next: LayoutBreakpoint) => { breakpoint = next; document.body.dataset.layoutBreakpoint = next; changed(draft, false); renderProperties(); renderList(); update(); status(`Редактируется ${breakpoint} раскладка. Другие размеры экрана сохраняются отдельно.`); };
	const setEntryVisibility = (entry: Entry, visible: boolean) => {
		for (const bp of LAYOUT_BREAKPOINTS) { const layout = layoutFor(entry, bp); layout.visible = visible; storeLayout(entry, layout, bp); }
		applyEntry(entry); notifyChange(false);
	};
	const undo = (redo = false) => {
		const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack, next = from.pop(); if (!next) return;
		to.push(structuredClone(draft)); draft = validateContent(next); selected = selected.filter(item => draft.sections.some(section => section.id === item.sectionId));
		notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); update(); status(redo ? 'Повторено.' : 'Изменение отменено.');
	};
	const addElement = () => {
		const section = currentSection(); if (!section) return;
		const before = structuredClone(draft), type = query<HTMLSelectElement>('[data-ui="new-type"]').value as LayoutItemType, id = `layout-${crypto.randomUUID().slice(0, 10)}`;
		const item: LayoutItem = { id, type, title: type === 'panel' ? '' : type === 'button' ? 'Новая кнопка' : 'Новый блок', text: type === 'panel' ? '' : 'Измените текст и оформление в панели свойств.' };
		section.layoutItems ??= []; section.layoutItems.push(item);
		const point = getCamera(), index = section.layoutItems.length - 1, count = section.layoutItems.length;
		const entry: Entry = { section, element: document.createElement('div'), id, role: `custom-${type}`, index };
		for (const bp of LAYOUT_BREAKPOINTS) {
			const layout = defaultElementLayout(section.id, entry.role, index, count, bp, routeAnchor(section));
			if (type === 'panel') {
				layout.worldX = point.x - (bp === 'mobile' ? 195 : 260); layout.worldY = point.y - (bp === 'mobile' ? 130 : 160);
				layout.width = bp === 'mobile' ? 390 : bp === 'tablet' ? 470 : 520; layout.height = bp === 'mobile' ? 260 : 320;
				layout.coordinateSpace = 'world'; delete layout.parentId;
			} else {
			const parentId = sectionContentFrameId(section);
			const parentIndex = section.layoutItems?.findIndex(value => value.id === parentId) ?? -1;
			const parentRole = parentId === PANEL_LAYOUT_ID ? 'panel' : 'custom-panel';
			const parent = elementLayout(section, parentId, parentRole, Math.max(0, parentIndex), section.layoutItems?.length ?? 1, bp, routeAnchor(section));
				layout.worldX = point.x - parent.worldX; layout.worldY = point.y - parent.worldY;
				layout.width = bp === 'mobile' ? 400 : bp === 'tablet' ? 420 : 360; layout.height = 150;
			}
			layout.align = 'left'; layout.textAlign = 'left'; layout.visible = true;
			storeLayout(entry, layout, bp);
		}
		commitDiscrete(before); selected = [{ sectionId: section.id, id }]; notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); status(type === 'panel' ? 'Пустая рамка создана в позиции текущей камеры. Разместите её и сохраните.' : 'Новый элемент создан в мировой позиции текущей камеры во всех адаптивных раскладках.');
	};
	const duplicate = () => {
		const source = selected[0] && findEntry(selected[0]); if (!source) return;
		const before = structuredClone(draft), id = `copy-${crypto.randomUUID().slice(0, 10)}`;
		if (source.role === 'custom-logo') {
			const item: LayoutItem = { id, type: 'logo', title: 'AMF Client', text: source.section.layoutItems?.find(value => value.id === source.id)?.text ?? '' };
			source.section.layoutItems ??= []; source.section.layoutItems.push(item);
			for (const bp of LAYOUT_BREAKPOINTS) {
				const layout = structuredClone(layoutFor(source, bp)); layout.worldX += 48; layout.worldY += 48; layout.coordinateSpace = 'world'; delete layout.parentId; layout.visible = true;
				source.section.layout ??= {}; source.section.layout[bp] ??= {}; source.section.layout[bp]![id] = layout;
			}
			commitDiscrete(before); selected = [{ sectionId: source.section.id, id }]; notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); status('Wordmark продублирован и остаётся отдельным объектом карты.'); return;
		}
		if (source.role === 'panel' || source.role === 'custom-panel') {
			const item: LayoutItem = { id, type: 'panel', title: '', text: '' };
			source.section.layoutItems ??= []; source.section.layoutItems.push(item);
			for (const bp of LAYOUT_BREAKPOINTS) {
				const layout = structuredClone(layoutFor(source, bp)); layout.worldX += 48; layout.worldY += 48; layout.coordinateSpace = 'world'; delete layout.parentId; layout.visible = true;
				source.section.layout ??= {}; source.section.layout[bp] ??= {}; source.section.layout[bp]![id] = layout;
			}
			commitDiscrete(before); selected = [{ sectionId: source.section.id, id }]; notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); status('Пустая рамка продублирована.'); return;
		}
		source.section.layoutExtras ??= []; const extra: LayoutExtra = { id, sourceId: source.id };
		if (source.role === 'card' || source.role.startsWith('custom-')) { extra.title = source.element.querySelector('h3')?.textContent ?? ''; extra.text = source.element.querySelector('p')?.textContent ?? ''; }
		if (source.role === 'action') extra.label = source.element.textContent ?? '';
		source.section.layoutExtras.push(extra);
		for (const bp of LAYOUT_BREAKPOINTS) { const layout = structuredClone(layoutFor(source, bp)); layout.worldX += 48; layout.worldY += 48; layout.visible = true; source.section.layout ??= {}; source.section.layout[bp] ??= {}; source.section.layout[bp]![id] = layout; }
		commitDiscrete(before); selected = [{ sectionId: source.section.id, id }]; notifyChange(true); renderList(); renderProperties(); status('Копия создана и может редактироваться независимо от источника.');
	};
	const deleteItems = () => {
		const entries = selected.map(findEntry).filter((entry): entry is Entry => !!entry); if (!entries.length) return;
		const before = structuredClone(draft);
		for (const entry of entries) {
			if (entry.element.dataset.layoutExtra === 'true') { entry.section.layoutExtras = entry.section.layoutExtras?.filter(extra => extra.id !== entry.id); for (const bp of LAYOUT_BREAKPOINTS) if (entry.section.layout?.[bp]) delete entry.section.layout[bp]![entry.id]; }
			else { entry.section.layoutRemoved ??= []; if (entry.section.layoutRemoved.includes(entry.id)) entry.section.layoutRemoved = entry.section.layoutRemoved.filter(id => id !== entry.id); else entry.section.layoutRemoved.push(entry.id); }
		}
		commitDiscrete(before); notifyChange(true); renderList(); renderProperties(); update(); status('Изменение применено. Удалённые блоки можно вернуть этой же кнопкой или через Ctrl+Z.');
	};
	const resetStyle = () => {
		const entry = selected[0] && findEntry(selected[0]); if (!entry) return;
		const before = structuredClone(draft);
		for (const bp of LAYOUT_BREAKPOINTS) {
			const current = layoutFor(entry, bp), defaults = defaultElementLayout(entry.section.id, entry.role, entry.index, entry.role === 'card' ? entry.section.cards.length : entry.role === 'action' ? entry.section.actions.length : entry.role.startsWith('custom-') ? (entry.section.layoutItems?.length ?? 1) : 1, bp, routeAnchor(entry.section));
			defaults.worldX = current.worldX; defaults.worldY = current.worldY; defaults.width = current.width; defaults.height = current.height;
			if (current.coordinateSpace === 'world') { defaults.coordinateSpace = 'world'; delete defaults.parentId; }
			storeLayout(entry, defaults, bp);
		}
		commitDiscrete(before); notifyChange(false); applyEntry(entry); renderProperties(); status('Стиль сброшен, мировые координаты и размеры сохранены.');
	};
	const save = async () => {
		try {
			for (const section of draft.sections) {
				const anchor = routeAnchor(section);
				section.layout ??= {};
				for (const bp of LAYOUT_BREAKPOINTS) section.layout[bp] = { ...section.layout[bp], ...materializeSectionLayout(section, bp, anchor) };
			}
			const content = validateContent(draft), digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(validateContent(initial))));
			const version = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
			const response = await fetch('/__dev/site-content', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AMF-Content-Version': version }, body: JSON.stringify(content) });
			if (!response.ok) throw Error(await response.text());
			initial = structuredClone(content); draft = structuredClone(content); status('JSON сохранён в public/site-sections.json. Сервер создал резервную копию предыдущей версии.');
		} catch (error) { status(`Не удалось сохранить: ${(error as Error).message}`, true); }
	};
	const reload = async () => {
		try { if (JSON.stringify(draft) !== JSON.stringify(initial) && !window.confirm('Есть несохранённые изменения. Загрузить JSON и отбросить их?')) return; const response = await fetch(`${import.meta.env.BASE_URL}site-sections.json?reload=${Date.now()}`, { cache: 'no-store' }); if (!response.ok) throw Error(`HTTP ${response.status}`); const next = validateContent(await response.json()); draft = next; initial = structuredClone(next); selected = []; undoStack = []; redoStack = []; notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); status('Конфигурация JSON загружена из проекта.'); }
		catch (error) { status(`Ошибка загрузки JSON: ${(error as Error).message}`, true); }
	};
	const restoreBackup = async () => {
		try {
			const response = await fetch('/__dev/site-layout-backups'); if (!response.ok) throw Error(await response.text());
			const result = await response.json() as { backups: { name: string; modified: string }[] };
			if (!result.backups.length) throw Error('Резервных копий пока нет');
			const name = window.prompt(`Введите имя резервной копии для восстановления:\n${result.backups.slice(0, 20).map(item => item.name).join('\n')}`, result.backups[0].name);
			if (!name) return;
			const before = structuredClone(draft), restored = await fetch('/__dev/site-layout-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
			if (!restored.ok) throw Error(await restored.text());
			const content = validateContent(await restored.json()); commitDiscrete(before); draft = content; initial = structuredClone(content); selected = []; notifyChange(true); renderSectionChoices(); renderList(); renderProperties(); status(`Восстановлена копия ${name}. Текущая версия сохранена сервером в резервную папку.`);
		} catch (error) { status(`Восстановление не выполнено: ${(error as Error).message}`, true); }
	};
	const command = async (name: string) => {
		if (name === 'preview') { preview(); return; }
		if (name === 'add') { addElement(); return; }
		if (name === 'duplicate') { duplicate(); return; }
		if (name === 'delete') { deleteItems(); return; }
		if (name === 'undo') { undo(); return; }
		if (name === 'redo') { undo(true); return; }
		if (name === 'save') { await save(); return; }
		if (name === 'reload') { await reload(); return; }
		if (name === 'restore') { await restoreBackup(); return; }
		if (name === 'reset') { resetStyle(); return; }
		const entries = selected.map(findEntry).filter((entry): entry is Entry => !!entry); if (!entries.length) return;
		const before = structuredClone(draft);
		if (name === 'visibility') { const visible = entries.some(entry => layoutFor(entry).visible === false); for (const entry of entries) setEntryVisibility(entry, visible); status(visible ? 'Выбранные элементы показаны.' : 'Выбранные элементы скрыты только в публичном виде. Их можно восстановить.'); }
		else if (name === 'group') { const id = `group-${crypto.randomUUID().slice(0, 8)}`; for (const entry of entries) { const layout = layoutFor(entry); layout.groupId = id; storeLayout(entry, layout); applyEntry(entry, layout); } notifyChange(false); status(`Выделенные элементы объединены: ${id}. Их можно двигать группой.`); }
		else if (name === 'ungroup') { for (const entry of entries) { const layout = layoutFor(entry); delete layout.groupId; storeLayout(entry, layout); applyEntry(entry, layout); } notifyChange(false); status('Группировка снята.'); }
		else if (name === 'front' || name === 'back') { const z = entries.map(entry => layoutFor(entry).zIndex); const value = name === 'front' ? Math.max(...z) + 1 : Math.min(...z) - 1; for (const entry of entries) { const layout = layoutFor(entry); layout.zIndex = Math.max(-1000, Math.min(1000, value)); storeLayout(entry, layout); applyEntry(entry, layout); } notifyChange(false); status('Порядок наложения изменён.'); }
		commitDiscrete(before); renderList(); renderProperties(); update();
	};

	query<HTMLSelectElement>('[data-ui="section"]').addEventListener('change', () => { selected = []; renderList(); renderProperties(); update(); });
	panel.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-command]'); if (button) void command(button.dataset.command!); const bp = (event.target as Element).closest<HTMLButtonElement>('[data-breakpoint]'); if (bp) selectBreakpoint(bp.dataset.breakpoint as LayoutBreakpoint); });
	const onWorldPointerDown = (event: Event) => pointerDownOnWorld(event as PointerEvent);
	const onOverlayPointerDown = (event: Event) => pointerDownOnOverlay(event as PointerEvent);
	const onPointerMove = (event: Event) => pointerMove(event as PointerEvent);
	const onPointerEnd = (event: Event) => pointerEnd(event as PointerEvent);
	const onKeyDown = (event: KeyboardEvent) => {
		if (!document.body.classList.contains('layout-edit-mode') || event.isComposing || (event.target as Element)?.closest('input,textarea,select,[contenteditable=true]')) return;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopImmediatePropagation(); undo(event.shiftKey); }
		else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopImmediatePropagation(); undo(true); }
		else if (event.key === 'Delete' && selected.length) { event.preventDefault(); deleteItems(); }
	};
	const onResize = () => update();
	const onScroll = () => update();
	const onLocaleChange = () => { renderSectionChoices(); renderList(); };
	document.addEventListener('pointerdown', onWorldPointerDown);
	overlay.addEventListener('pointerdown', onOverlayPointerDown);
	document.addEventListener('pointermove', onPointerMove);
	document.addEventListener('pointerup', onPointerEnd);
	document.addEventListener('pointercancel', onPointerEnd);
	document.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('resize', onResize);
	window.addEventListener('scroll', onScroll, true);
	document.addEventListener('amf-locale-change', onLocaleChange);
	removers.push(() => document.removeEventListener('pointerdown', onWorldPointerDown), () => overlay.removeEventListener('pointerdown', onOverlayPointerDown), () => document.removeEventListener('pointermove', onPointerMove), () => document.removeEventListener('pointerup', onPointerEnd), () => document.removeEventListener('pointercancel', onPointerEnd), () => document.removeEventListener('keydown', onKeyDown, true), () => window.removeEventListener('resize', onResize), () => window.removeEventListener('scroll', onScroll, true), () => document.removeEventListener('amf-locale-change', onLocaleChange));

	renderSectionChoices();
	query<HTMLSelectElement>('[data-ui="section"]').value = draft.sections[0]?.id ?? '';
	renderList(); renderProperties(); syncLayoutMode(); status('Раскладка загружена. Координаты задаются в мировых единицах карты.');
	return {
		update,
		dispose() { observer.disconnect(); window.clearTimeout(transactionTimer); for (const remove of removers) remove(); panel.remove(); overlay.remove(); document.body.classList.remove('layout-edit-mode'); delete document.body.dataset.layoutBreakpoint; },
	};
}
