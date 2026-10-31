import { mainPoints } from './site-navigation';
import type { RouteConfig } from './route';
import { LAYOUT_BREAKPOINTS, type ElementLayout, type LayoutBreakpoint, type LayoutExtra, type LayoutItem, type LayoutItemType, type LayoutProfiles } from './site-layout';
import { LOCALES, type Locale } from './i18n';

export interface SiteAction { label: string; sectionId?: string; href?: string; download?: boolean }
export interface SiteSection {
	id: string;
	pointId: string;
	label: string;
	eyebrow: string;
	title: string;
	accent: string;
	description: string;
	subtitle?: string;
	cards: { title: string; text: string }[];
	actions: SiteAction[];
	layout?: LayoutProfiles;
	layoutExtras?: LayoutExtra[];
	layoutItems?: LayoutItem[];
	layoutRemoved?: string[];
}
export interface SiteContent { version: 1; sections: SiteSection[] }

export function updateLayoutItemTranslation(item: LayoutItem, locale: Locale, text: string): void {
	item.translations ??= {};
	item.translations[locale] = text;
}

export function layoutItemTranslation(item: LayoutItem, locale: Locale, fallback: string): string {
	return item.translations?.[locale] ?? fallback;
}

const names = ['Главная', 'Возможности', 'Оптимизация', 'Интерфейс', 'Статистика', 'Персонализация', 'Скачать'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_URL = /^https:\/\//i;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function validateLayout(raw: unknown): LayoutProfiles {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Некорректная раскладка раздела');
	const profiles = raw as Record<string, unknown>, result: LayoutProfiles = {};
	for (const [bp, value] of Object.entries(profiles)) {
		if (!LAYOUT_BREAKPOINTS.includes(bp as LayoutBreakpoint) || !value || typeof value !== 'object' || Array.isArray(value)) throw Error('Некорректный breakpoint раскладки');
		const profile: Record<string, Partial<ElementLayout>> = {};
		for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
			if (!/^[-\w:]+$/.test(id) || !item || typeof item !== 'object' || Array.isArray(item)) throw Error('Некорректный элемент раскладки');
			const style = item as Record<string, unknown>, checked: Partial<ElementLayout> = {};
			const numeric = ['worldX', 'worldY', 'width', 'height', 'zIndex', 'backgroundOpacity', 'blur', 'borderWidth', 'radius', 'shadowIntensity', 'innerShadowIntensity', 'glowIntensity', 'padding', 'fontSize', 'fontWeight', 'lineHeight', 'opacity', 'letterSpacing', 'subtitleFontSize', 'subtitleFontWeight', 'subtitleGap', 'subtitleLetterSpacing', 'subtitleOpacity'] as const;
			for (const key of numeric) if (hasOwn(style, key)) {
				const n = style[key];
				if (typeof n !== 'number' || !Number.isFinite(n)) throw Error(`Некорректное значение ${key}`);
				const ranges: Record<typeof key, [number, number]> = {
					worldX: [-10000000, 10000000], worldY: [-10000000, 10000000], width: [1, 1000000], height: [1, 1000000], zIndex: [-1000, 1000],
					backgroundOpacity: [0, 100], blur: [0, 24], borderWidth: [0, 8], radius: [0, 80], shadowIntensity: [0, 100], innerShadowIntensity: [0, 100], glowIntensity: [0, 100], padding: [0, 100], fontSize: [6, 160], fontWeight: [100, 900], lineHeight: [0.7, 3], opacity: [0, 100], letterSpacing: [-20, 50],
					subtitleFontSize: [6, 100], subtitleFontWeight: [100, 900], subtitleGap: [0, 80], subtitleLetterSpacing: [-5, 20], subtitleOpacity: [0, 100],
				};
				const [min, max] = ranges[key];
				if (n < min || n > max) throw Error(`Значение ${key} вне допустимого диапазона`);
				Object.assign(checked, { [key]: n });
			}
			for (const key of ['background', 'borderColor', 'shadowColor', 'color', 'subtitleColor'] as const) if (hasOwn(style, key)) {
				if (typeof style[key] !== 'string' || !HEX_COLOR.test(style[key] as string)) throw Error(`Некорректный цвет ${key}`);
				Object.assign(checked, { [key]: style[key] });
			}
			if (hasOwn(style, 'align')) { if (!['left', 'center', 'right'].includes(String(style.align))) throw Error('Некорректное выравнивание элемента'); checked.align = style.align as ElementLayout['align']; }
			if (hasOwn(style, 'textAlign')) { if (!['left', 'center', 'right'].includes(String(style.textAlign))) throw Error('Некорректное выравнивание текста'); checked.textAlign = style.textAlign as ElementLayout['textAlign']; }
			if (hasOwn(style, 'gradient')) { if (typeof style.gradient !== 'string' || style.gradient.length > 240 || /[;{}<>]|url\s*\(|var\s*\(|expression\s*\(/i.test(style.gradient)) throw Error('Некорректный градиент'); checked.gradient = style.gradient; }
			if (hasOwn(style, 'fontFamily')) { if (typeof style.fontFamily !== 'string' || style.fontFamily.length > 100 || !/^[\w\s,'"-]+$/.test(style.fontFamily)) throw Error('Некорректный шрифт'); checked.fontFamily = style.fontFamily; }
			if (hasOwn(style, 'visible')) { if (typeof style.visible !== 'boolean') throw Error('Некорректная видимость элемента'); checked.visible = style.visible; }
			if (hasOwn(style, 'groupId')) { if (typeof style.groupId !== 'string' || style.groupId.length > 64 || !/^[-\w]+$/.test(style.groupId)) throw Error('Некорректная группа элемента'); checked.groupId = style.groupId; }
			if (hasOwn(style, 'coordinateSpace')) { if (style.coordinateSpace !== 'world' && style.coordinateSpace !== 'parent') throw Error('Некорректная система координат элемента'); checked.coordinateSpace = style.coordinateSpace; }
			if (hasOwn(style, 'parentId')) { if (style.parentId !== undefined && (typeof style.parentId !== 'string' || !/^[-\w:]+$/.test(style.parentId))) throw Error('Некорректный родитель элемента'); checked.parentId = style.parentId as string | undefined; }
			profile[id] = checked;
		}
		result[bp as LayoutBreakpoint] = profile;
	}
	return result;
}

function validAction(action: unknown): action is SiteAction {
	if (!action || typeof action !== 'object') return false;
	const a = action as Record<string, unknown>;
	return typeof a.label === 'string' && a.label.length <= 500 && (a.sectionId === undefined || typeof a.sectionId === 'string') &&
		(a.href === undefined || typeof a.href === 'string' && a.href.length <= 2000 && SAFE_URL.test(a.href)) &&
		(a.download === undefined || typeof a.download === 'boolean') && !(a.download && !a.href);
}

export function validateContent(raw: unknown): SiteContent {
	const c = raw as SiteContent;
	if (!c || c.version !== 1 || !Array.isArray(c.sections) || c.sections.length > 128) throw Error('Неверный файл разделов');
	const sectionIds = new Set<string>();
	for (const s of c.sections) {
		if (!s || typeof s.id !== 'string' || !/^[-\w]+$/.test(s.id) || sectionIds.has(s.id)) throw Error('Некорректный ID раздела');
		sectionIds.add(s.id);
		for (const key of ['pointId', 'label', 'eyebrow', 'title', 'accent', 'description'] as const) if (typeof s[key] !== 'string' || s[key].length > 4000) throw Error(`Некорректное поле ${key}`);
		if (s.subtitle !== undefined && (typeof s.subtitle !== 'string' || s.subtitle.length > 4000)) throw Error('Некорректный подзаголовок');
		if (!Array.isArray(s.cards) || s.cards.length > 12 || s.cards.some(card => !card || typeof card.title !== 'string' || typeof card.text !== 'string' || card.title.length > 1000 || card.text.length > 4000)) throw Error('Некорректные карточки');
		if (!Array.isArray(s.actions) || s.actions.length > 8 || s.actions.some(action => !validAction(action))) throw Error('Некорректные кнопки/ссылки');
		if (s.layout !== undefined) s.layout = validateLayout(s.layout);
		if (s.layoutExtras !== undefined) {
			if (!Array.isArray(s.layoutExtras) || s.layoutExtras.length > 128) throw Error('Слишком много копий элементов');
			const extraIds = new Set<string>();
			for (const extra of s.layoutExtras) {
				if (!extra || typeof extra.id !== 'string' || !/^[-\w:]+$/.test(extra.id) || typeof extra.sourceId !== 'string' || !/^[-\w:]+$/.test(extra.sourceId) || extra.id === extra.sourceId || extraIds.has(extra.id)) throw Error('Некорректная копия элемента');
				for (const key of ['title', 'text', 'label'] as const) if (extra[key] !== undefined && (typeof extra[key] !== 'string' || extra[key]!.length > 4000)) throw Error(`Некорректное поле копии ${key}`);
				if (extra.href !== undefined && (typeof extra.href !== 'string' || extra.href.length > 2000 || !SAFE_URL.test(extra.href))) throw Error('Некорректная ссылка копии');
				extraIds.add(extra.id);
			}
		}
		if (s.layoutItems !== undefined) {
			if (!Array.isArray(s.layoutItems) || s.layoutItems.length > 128) throw Error('Слишком много пользовательских элементов');
			const itemIds = new Set<string>();
			for (const item of s.layoutItems) {
				if (!item || typeof item.id !== 'string' || !/^[-\w:]+$/.test(item.id) || itemIds.has(item.id) || !['text', 'card', 'button', 'panel', 'logo'].includes(item.type) || typeof item.title !== 'string' || typeof item.text !== 'string' || item.title.length > 1000 || item.text.length > 4000 || item.sectionId !== undefined && typeof item.sectionId !== 'string' || item.href !== undefined && (typeof item.href !== 'string' || item.href.length > 2000 || !SAFE_URL.test(item.href))) throw Error('Некорректный пользовательский элемент');
				if (item.translations !== undefined) {
					if (!item.translations || typeof item.translations !== 'object' || Array.isArray(item.translations)) throw Error('Некорректные переводы пользовательского элемента');
					for (const [locale, text] of Object.entries(item.translations)) if (!LOCALES.includes(locale as Locale) || typeof text !== 'string' || text.length > 4000) throw Error('Некорректный перевод пользовательского элемента');
				}
				itemIds.add(item.id);
			}
		}
		if (s.layoutRemoved !== undefined) {
			if (!Array.isArray(s.layoutRemoved) || s.layoutRemoved.length > 256 || s.layoutRemoved.some(id => typeof id !== 'string' || !/^[-\w:]+$/.test(id)) || new Set(s.layoutRemoved).size !== s.layoutRemoved.length) throw Error('Некорректный список удалённых элементов');
		}
	}
	return structuredClone(c);
}

export function resolveSections(config: RouteConfig, content: SiteContent) {
	return mainPoints(config).map((point, index, all) => {
		const existing = content.sections.find(section => section.pointId === point.id);
		if (existing) return existing;
		const label = index === 0 ? 'Главная' : index === all.length - 1 ? 'Скачать' : names[index] ?? `Раздел ${index + 1}`;
		return { id: `stop-${index + 1}`, pointId: point.id, label, eyebrow: '', title: '', accent: '', description: '', cards: [], actions: [] } as SiteSection;
	});
}
