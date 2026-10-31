export const LOCALES = ['en', 'ru', 'uk'] as const;
export type Locale = typeof LOCALES[number];

const messages = {
	en: {
		'nav.home': 'Home', 'nav.features': 'Features', 'nav.optimization': 'Optimization', 'nav.interface': 'Interface', 'nav.statistics': 'Statistics', 'nav.personalization': 'Personalization', 'nav.download': 'Download', 'nav.siteSections': 'Site sections',
		'repository.label': 'AMF Client on GitHub', 'canvas.label': 'Interactive DDNet map For Site',
		'site.description': 'AMF Client 2.0.1 — Nova Edition. Explore the real DDNet map and client features.',
		'language.label': 'Language', 'language.choose': 'Choose language', 'language.en': 'English', 'language.ru': 'Русский', 'language.uk': 'Українська',
		'desktopOnly.title': 'Desktop Version Only', 'desktopOnly.message': 'AMF Client website is currently available on desktop computers. Mobile and tablet support is coming soon.',
		'footer.scrollHint': 'Scroll to move along the map', 'footer.entities': 'Entities',
		'loading.title': 'Loading the Nova world', 'loading.detail': 'Reading the original For Site.map…', 'loading.error': 'Could not load the map',
		'diagnostics.title': 'Map and renderer', 'diagnostics.loading': 'Loading…',
		'download.primary': 'Download AMF Client', 'download.github': 'View on GitHub', 'download.portable': 'Windows x64 Portable', 'panel.emptyFrame': 'Empty layout frame',
		'brand.wordmarkTagline': 'Comfort. Control. Quality.',
		'content.home.title': 'DDNet, at a new level', 'content.home.subtitle': 'A client shaped around your play',
		'content.home.overview.title': 'A familiar world, with the AMF touch', 'content.home.overview.text': 'A familiar DDNet world, with AMF’s own style.',
		'content.features.title': 'A new era of possibilities', 'content.features.subtitle': 'Freedom, control and new possibilities in AMF Client',
		'content.optimization.title': 'Focus and comfort', 'content.optimization.subtitle': 'Choose which visual elements stay out of your way.',
		'content.interface.title': 'Tools within the client', 'content.interface.subtitle': 'Personalize your HUD and control playback in game.',
		'content.statistics.title': 'Run Statistics', 'content.statistics.subtitle': 'Review team runs with event context and participant details.',
		'content.personalization.title': 'Visual personalization', 'content.personalization.subtitle': 'Shape map colors and supported interface accents.',
		'content.download.title': 'AMF Client', 'content.download.accent': 'Nova Edition', 'content.download.subtitle': 'Windows x64 Portable', 'content.download.description': 'Get the ready-to-use AMF Client 2.0.1 release.',
		'content.impact.title': 'Impact System', 'content.impact.text': 'Connect run events with each player’s contribution.',
		'content.focus.title': 'Focus Mode', 'content.focus.text': 'Fewer on-screen distractions, so the route stays in focus.',
		'content.tools.title': 'Purpose-built tools', 'content.tools.text': 'AMF’s own tools live inside the DDNet client.',
		'content.effects.title': 'Visual effects', 'content.effects.text': 'Hide selected particles and effects to open up the playfield.',
		'content.ui.title': 'Interface visibility', 'content.ui.text': 'Focus Mode can hide chat, names, scoreboard, HUD and Music Player.',
		'content.hud.title': 'HUD Editor', 'content.hud.text': 'Move and scale supported HUD modules to shape your layout.',
		'content.music.title': 'Music Player', 'content.music.text': 'Control playback and volume directly from the game HUD.',
		'content.rating.title': 'Rating and MVP', 'content.rating.text': 'Run rating, MVP and participant details in one view.',
		'content.history.title': 'Run history', 'content.history.text': 'Revisit run timelines with Saves, Aleds, Clutches and Falls.',
		'content.tune.title': 'Tune Zone colors', 'content.tune.text': 'Give supported Tune Zones distinct colors on the map.',
		'content.gradient.title': 'Gradient Modules', 'content.gradient.text': 'Apply gradient styling to client modules that offer the setting.',
		'content.personalColors.title': 'Personal map colors', 'content.personalColors.text': 'Tune Zone colors let you distinguish areas in your own visual style.',
		'content.release.title': 'Portable release', 'content.release.text': 'Version 2.0.1 for Windows x64, ready to download.',
	},
	ru: {
		'nav.home': 'Главная', 'nav.features': 'Возможности', 'nav.optimization': 'Оптимизация', 'nav.interface': 'Интерфейс', 'nav.statistics': 'Статистика', 'nav.personalization': 'Персонализация', 'nav.download': 'Скачать', 'nav.siteSections': 'Разделы сайта',
		'repository.label': 'AMF Client на GitHub', 'canvas.label': 'Интерактивная DDNet-карта For Site',
		'site.description': 'AMF Client 2.0.1 — Nova Edition. Исследуйте настоящую карту DDNet и возможности клиента.',
		'language.label': 'Язык', 'language.choose': 'Выбрать язык', 'language.en': 'English', 'language.ru': 'Русский', 'language.uk': 'Українська',
		'desktopOnly.title': 'Только для компьютеров', 'desktopOnly.message': 'Сайт AMF Client пока доступен только на компьютерах. Поддержка телефонов и планшетов появится позже.',
		'footer.scrollHint': 'Колёсико перемещает камеру по карте', 'footer.entities': 'Сущности',
		'loading.title': 'Загружаем мир Nova', 'loading.detail': 'Читаем оригинальную For Site.map…', 'loading.error': 'Не удалось открыть карту',
		'diagnostics.title': 'Карта и рендер', 'diagnostics.loading': 'Загрузка…',
		'download.primary': 'Скачать AMF Client', 'download.github': 'Посмотреть на GitHub', 'download.portable': 'Windows x64 Portable', 'panel.emptyFrame': 'Пустая рамка макета',
		'brand.wordmarkTagline': 'Комфорт. Контроль. Качество.',
		'content.home.title': 'DDNet. На новом уровне.', 'content.home.subtitle': 'Клиент, который подстраивается под ваш стиль игры',
		'content.home.overview.title': 'Знакомый мир с характером AMF', 'content.home.overview.text': 'Привычный мир DDNet с собственным стилем AMF.',
		'content.features.title': 'Новая эра возможностей', 'content.features.subtitle': 'Свобода, контроль и новые возможности в AMF Client',
		'content.optimization.title': 'Фокус и комфорт', 'content.optimization.subtitle': 'Выберите, какие визуальные элементы не будут отвлекать.',
		'content.interface.title': 'Инструменты клиента', 'content.interface.subtitle': 'Настраивайте HUD и управляйте воспроизведением в игре.',
		'content.statistics.title': 'Статистика забегов', 'content.statistics.subtitle': 'Разбирайте командные забеги, события и вклад участников.',
		'content.personalization.title': 'Визуальная персонализация', 'content.personalization.subtitle': 'Настраивайте цвета карты и поддерживаемые акценты интерфейса.',
		'content.download.title': 'AMF Client', 'content.download.accent': 'Nova Edition', 'content.download.subtitle': 'Windows x64 Portable', 'content.download.description': 'Скачайте готовую сборку AMF Client 2.0.1.',
		'content.impact.title': 'Impact System', 'content.impact.text': 'Связывает события забега с вкладом каждого игрока.',
		'content.focus.title': 'Focus Mode', 'content.focus.text': 'Меньше визуального шума во время игры.',
		'content.tools.title': 'Особые инструменты', 'content.tools.text': 'Инструменты AMF встроены прямо в клиент DDNet.',
		'content.effects.title': 'Визуальные эффекты', 'content.effects.text': 'Скрывайте выбранные частицы и эффекты, чтобы освободить игровое поле.',
		'content.ui.title': 'Видимость интерфейса', 'content.ui.text': 'Focus Mode может скрыть чат, имена, таблицу счёта, HUD и Music Player.',
		'content.hud.title': 'HUD Editor', 'content.hud.text': 'Перемещайте и масштабируйте поддерживаемые модули HUD под свой макет.',
		'content.music.title': 'Music Player', 'content.music.text': 'Управляйте воспроизведением и громкостью прямо из игрового HUD.',
		'content.rating.title': 'Rating и MVP', 'content.rating.text': 'Рейтинг забега, MVP и сведения об участниках в одном разделе.',
		'content.history.title': 'История забегов', 'content.history.text': 'Просматривайте прошлые забеги, сейвы, Aleds, клатчи и падения.',
		'content.tune.title': 'Цвета Tune Zone', 'content.tune.text': 'Назначайте поддерживаемым Tune Zone собственные цвета на карте.',
		'content.gradient.title': 'Gradient Modules', 'content.gradient.text': 'Добавляйте градиентное оформление в модули, где оно поддерживается.',
		'content.personalColors.title': 'Свои цвета карты', 'content.personalColors.text': 'Цвета Tune Zone помогают различать области в удобном вам стиле.',
		'content.release.title': 'Портативная сборка', 'content.release.text': 'Версия 2.0.1 для Windows x64, готовая к скачиванию.',
	},
	uk: {
		'nav.home': 'Головна', 'nav.features': 'Можливості', 'nav.optimization': 'Оптимізація', 'nav.interface': 'Інтерфейс', 'nav.statistics': 'Статистика', 'nav.personalization': 'Персоналізація', 'nav.download': 'Завантажити', 'nav.siteSections': 'Розділи сайту',
		'repository.label': 'AMF Client на GitHub', 'canvas.label': 'Інтерактивна DDNet-мапа For Site',
		'site.description': 'AMF Client 2.0.1 — Nova Edition. Досліджуйте справжню мапу DDNet і можливості клієнта.',
		'language.label': 'Мова', 'language.choose': 'Обрати мову', 'language.en': 'English', 'language.ru': 'Русский', 'language.uk': 'Українська',
		'desktopOnly.title': 'Лише для комп\'ютерів', 'desktopOnly.message': 'Сайт AMF Client поки доступний лише на комп\'ютерах. Підтримка телефонів і планшетів з\'явиться пізніше.',
		'footer.scrollHint': 'Коліщатко переміщує камеру мапою', 'footer.entities': 'Сутності',
		'loading.title': 'Завантажуємо світ Nova', 'loading.detail': 'Читаємо оригінальну For Site.map…', 'loading.error': 'Не вдалося відкрити мапу',
		'diagnostics.title': 'Мапа та рендер', 'diagnostics.loading': 'Завантаження…',
		'download.primary': 'Завантажити AMF Client', 'download.github': 'Переглянути на GitHub', 'download.portable': 'Windows x64 Portable', 'panel.emptyFrame': 'Порожня рамка макета',
		'brand.wordmarkTagline': 'Комфорт. Контроль. Якість.',
		'content.home.title': 'DDNet. На новому рівні.', 'content.home.subtitle': 'Клієнт, що підлаштовується під ваш стиль гри',
		'content.home.overview.title': 'Знайомий світ у стилі AMF', 'content.home.overview.text': 'Знайомий світ DDNet із власним стилем AMF.',
		'content.features.title': 'Нова ера можливостей', 'content.features.subtitle': 'Свобода, контроль і нові можливості в AMF Client',
		'content.optimization.title': 'Фокус і комфорт', 'content.optimization.subtitle': 'Оберіть візуальні елементи, які не відволікатимуть.',
		'content.interface.title': 'Інструменти клієнта', 'content.interface.subtitle': 'Налаштовуйте HUD і керуйте відтворенням у грі.',
		'content.statistics.title': 'Статистика забігів', 'content.statistics.subtitle': 'Переглядайте командні забіги, події та внесок учасників.',
		'content.personalization.title': 'Візуальна персоналізація', 'content.personalization.subtitle': 'Налаштовуйте кольори мапи та підтримувані акценти інтерфейсу.',
		'content.download.title': 'AMF Client', 'content.download.accent': 'Nova Edition', 'content.download.subtitle': 'Windows x64 Portable', 'content.download.description': 'Завантажте готову збірку AMF Client 2.0.1.',
		'content.impact.title': 'Impact System', 'content.impact.text': 'Поєднує події забігу з внеском кожного гравця.',
		'content.focus.title': 'Focus Mode', 'content.focus.text': 'Менше візуального шуму під час гри.',
		'content.tools.title': 'Особливі інструменти', 'content.tools.text': 'Інструменти AMF вбудовані безпосередньо в клієнт DDNet.',
		'content.effects.title': 'Візуальні ефекти', 'content.effects.text': 'Приховуйте вибрані частинки й ефекти, щоб звільнити ігрове поле.',
		'content.ui.title': 'Видимість інтерфейсу', 'content.ui.text': 'Focus Mode може приховати чат, імена, таблицю рахунку, HUD і Music Player.',
		'content.hud.title': 'HUD Editor', 'content.hud.text': 'Переміщуйте й масштабуйте підтримувані модулі HUD під свій макет.',
		'content.music.title': 'Music Player', 'content.music.text': 'Керуйте відтворенням і гучністю просто з ігрового HUD.',
		'content.rating.title': 'Rating і MVP', 'content.rating.text': 'Рейтинг забігу, MVP і відомості про учасників в одному розділі.',
		'content.history.title': 'Історія забігів', 'content.history.text': 'Переглядайте минулі забіги, сейви, Aleds, клатчі й падіння.',
		'content.tune.title': 'Кольори Tune Zone', 'content.tune.text': 'Призначайте підтримуваним Tune Zone власні кольори на мапі.',
		'content.gradient.title': 'Gradient Modules', 'content.gradient.text': 'Додавайте градієнти до модулів, де доступне таке оформлення.',
		'content.personalColors.title': 'Власні кольори мапи', 'content.personalColors.text': 'Кольори Tune Zone допомагають розрізняти ділянки у зручному стилі.',
		'content.release.title': 'Портативна збірка', 'content.release.text': 'Версія 2.0.1 для Windows x64, готова до завантаження.',
	},
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof typeof messages.en;
export const LOCALE_STORAGE_KEY = 'amf-site-locale';

const sectionKeys: Record<string, TranslationKey> = {
	home: 'nav.home', features: 'nav.features', optimization: 'nav.optimization', interface: 'nav.interface',
	statistics: 'nav.statistics', personalization: 'nav.personalization', download: 'nav.download',
};

export function resolveLocale(value: string | null | undefined): Locale {
	return LOCALES.includes(value as Locale) ? value as Locale : 'en';
}

function readStoredLocale(): Locale {
	try { return resolveLocale(typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCALE_STORAGE_KEY)); }
	catch { return 'en'; }
}

let activeLocale: Locale = readStoredLocale();

export function currentLocale(): Locale { return activeLocale; }

export function localeCode(locale: Locale = activeLocale): string { return locale === 'uk' ? 'UA' : locale.toUpperCase(); }

export function setLocale(locale: Locale): Locale {
	activeLocale = resolveLocale(locale);
	try { localStorage.setItem(LOCALE_STORAGE_KEY, activeLocale); } catch { /* Storage can be disabled; the current page still switches. */ }
	return activeLocale;
}

export function translate(key: string, locale: Locale = activeLocale): string {
	return messages[locale][key as TranslationKey] ?? messages.en[key as TranslationKey] ?? key;
}

export function sectionLabel(id: string, fallback = ''): string {
	const key = sectionKeys[id];
	return key ? translate(key) : fallback || translate('nav.home');
}

export function applyTranslations(root: ParentNode = document): void {
	if (typeof document !== 'undefined') document.documentElement.lang = activeLocale;
	for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
		const key = element.dataset.i18n;
		if (key) element.textContent = translate(key);
	}
	for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
		const declaration = element.dataset.i18nAttr;
		if (!declaration) continue;
		const separator = declaration.indexOf(':');
		if (separator < 1) continue;
		element.setAttribute(declaration.slice(0, separator), translate(declaration.slice(separator + 1)));
	}
}

export function translationKeys(): string[] { return Object.keys(messages.en); }
