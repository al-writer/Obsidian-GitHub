import { getLanguage } from "obsidian";

export type Language = "kk" | "ru" | "en";
export type LanguageSetting = Language | "auto";

export const LANGUAGE_NAMES: Record<Language, string> = {
	kk: "Қазақша",
	ru: "Русский",
	en: "English",
};

const en = {
	commandSync: "Sync now",
	ribbonSync: "Sync with GitHub",

	statusIdle: "GitHub: not synced yet",
	statusSyncing: "GitHub: syncing…",
	statusSynced: "GitHub: synced at {time}",
	statusConflicts: "GitHub: conflicts ({n})",
	statusError: "GitHub: sync error",
	statusTooltip: "Click to sync",

	noticeSyncing: "Qoima Sync: syncing…",
	noticeDone: "Qoima Sync: done. Received: {down}, sent: {up}, merged: {merged}",
	noticeUpToDate: "Qoima Sync: everything is up to date",
	noticeConflicts:
		"Qoima Sync: conflicts in {n} file(s). The remote versions were saved as conflict copies next to them:\n{files}",
	noticeAlreadyRunning: "Qoima Sync: sync is already running",
	noticeNotConfigured: "Qoima Sync: set the token and repository in the plugin settings",
	noticeError: "Qoima Sync error: {message}",
	noticeBranchesLoaded: "Branches loaded: {n}",

	errAuth: "the token is invalid or expired",
	errForbidden: "access denied: check the token permissions (Contents: Read and write)",
	errNotFound: "repository not found or the token has no access to it",
	errRateLimit: "GitHub API rate limit exceeded, try again later",
	errNetwork: "could not connect to GitHub",
	errTruncated: "the repository is too large: GitHub returned an incomplete file list",
	errMassDelete:
		"sync stopped: {n} file(s) would be deleted. If this is intended, turn off deletion protection in the settings",

	settingLanguage: "Language",
	settingLanguageAuto: "Same as Obsidian",
	settingLanguageDesc: "Plugin interface language. Command names are updated after restarting Obsidian.",
	settingToken: "GitHub token",
	settingTokenDesc: "Personal access token with read and write access to repository contents (Contents: Read and write).",
	settingOwner: "Repository owner",
	settingOwnerDesc: "GitHub user or organization name.",
	settingRepo: "Repository name",
	settingBranch: "Branch",
	settingBranchDesc: "Branch to sync with. If it does not exist, it is created from the default branch.",
	settingLoadBranches: "Load the list of branches",
	settingSyncOnStartup: "Sync on startup",
	settingSyncOnStartupDesc: "Automatically sync the vault when Obsidian starts.",
	settingSyncOnQuit: "Sync on quit",
	settingSyncOnQuitDesc: "Send changes to GitHub when Obsidian is closed. Desktop only: on mobile the system closes the app without warning.",
	settingSyncInterval: "Sync every N minutes",
	settingSyncIntervalDesc: "Periodic sync interval in minutes. 0 turns it off. Background syncs only notify about changes, conflicts and errors.",
	settingNotices: "Show notifications",
	settingNoticesDesc: "Show the sync status and result in pop-up notifications.",
	settingDeletionGuard: "Mass deletion protection",
	settingDeletionGuardDesc: "Stop the sync if it would delete more than half of the files.",
};

export type Strings = typeof en;

const ru: Strings = {
	commandSync: "Синхронизировать сейчас",
	ribbonSync: "Синхронизировать с GitHub",

	statusIdle: "GitHub: ещё не синхронизировано",
	statusSyncing: "GitHub: синхронизация…",
	statusSynced: "GitHub: синхронизировано в {time}",
	statusConflicts: "GitHub: конфликты ({n})",
	statusError: "GitHub: ошибка синхронизации",
	statusTooltip: "Нажмите, чтобы синхронизировать",

	noticeSyncing: "Qoima Sync: синхронизация…",
	noticeDone: "Qoima Sync: готово. Получено: {down}, отправлено: {up}, объединено: {merged}",
	noticeUpToDate: "Qoima Sync: всё актуально",
	noticeConflicts:
		"Qoima Sync: конфликты в файлах ({n}). Версии из GitHub сохранены рядом как копии конфликта:\n{files}",
	noticeAlreadyRunning: "Qoima Sync: синхронизация уже выполняется",
	noticeNotConfigured: "Qoima Sync: укажите токен и репозиторий в настройках плагина",
	noticeError: "Ошибка Qoima Sync: {message}",
	noticeBranchesLoaded: "Загружено веток: {n}",

	errAuth: "токен недействителен или истёк",
	errForbidden: "доступ запрещён: проверьте права токена (Contents: Read and write)",
	errNotFound: "репозиторий не найден или у токена нет к нему доступа",
	errRateLimit: "превышен лимит запросов к GitHub API, повторите позже",
	errNetwork: "не удалось подключиться к GitHub",
	errTruncated: "репозиторий слишком большой: GitHub вернул неполный список файлов",
	errMassDelete:
		"синхронизация остановлена: было бы удалено файлов: {n}. Если это намеренно, отключите защиту от удаления в настройках",

	settingLanguage: "Язык",
	settingLanguageAuto: "Как в Obsidian",
	settingLanguageDesc: "Язык интерфейса плагина. Названия команд обновятся после перезапуска Obsidian.",
	settingToken: "Токен GitHub",
	settingTokenDesc: "Персональный токен доступа с правом чтения и записи содержимого репозитория (Contents: Read and write).",
	settingOwner: "Владелец репозитория",
	settingOwnerDesc: "Имя пользователя или организации на GitHub.",
	settingRepo: "Название репозитория",
	settingBranch: "Ветка",
	settingBranchDesc: "Ветка, с которой идёт синхронизация. Если её нет, она будет создана из ветки по умолчанию.",
	settingLoadBranches: "Загрузить список веток",
	settingSyncOnStartup: "Синхронизировать при запуске",
	settingSyncOnStartupDesc: "Автоматически синхронизировать хранилище при запуске Obsidian.",
	settingSyncOnQuit: "Синхронизировать при закрытии",
	settingSyncOnQuitDesc: "Отправлять изменения на GitHub при закрытии Obsidian. Только на компьютере: на телефоне система закрывает приложение без предупреждения.",
	settingSyncInterval: "Синхронизировать каждые N минут",
	settingSyncIntervalDesc: "Интервал периодической синхронизации в минутах. 0 — отключено. Фоновая синхронизация сообщает только об изменениях, конфликтах и ошибках.",
	settingNotices: "Показывать уведомления",
	settingNoticesDesc: "Показывать статус и результат синхронизации во всплывающих уведомлениях.",
	settingDeletionGuard: "Защита от массового удаления",
	settingDeletionGuardDesc: "Остановить синхронизацию, если она удалила бы больше половины файлов.",
};

const kk: Strings = {
	commandSync: "Қазір синхрондау",
	ribbonSync: "GitHub-пен синхрондау",

	statusIdle: "GitHub: әлі синхрондалмаған",
	statusSyncing: "GitHub: синхрондалуда…",
	statusSynced: "GitHub: {time} синхрондалды",
	statusConflicts: "GitHub: қайшылықтар ({n})",
	statusError: "GitHub: синхрондау қатесі",
	statusTooltip: "Синхрондау үшін басыңыз",

	noticeSyncing: "Qoima Sync: синхрондалуда…",
	noticeDone: "Qoima Sync: дайын. Алынды: {down}, жіберілді: {up}, біріктірілді: {merged}",
	noticeUpToDate: "Qoima Sync: бәрі өзекті",
	noticeConflicts:
		"Qoima Sync: файлдарда қайшылықтар бар ({n}). GitHub-тағы нұсқалар қасына қайшылық көшірмесі ретінде сақталды:\n{files}",
	noticeAlreadyRunning: "Qoima Sync: синхрондау қазір жүріп жатыр",
	noticeNotConfigured: "Qoima Sync: плагин баптауларында токен мен репозиторийді көрсетіңіз",
	noticeError: "Qoima Sync қатесі: {message}",
	noticeBranchesLoaded: "Жүктелген тармақтар: {n}",

	errAuth: "токен жарамсыз немесе мерзімі өткен",
	errForbidden: "қол жеткізуге тыйым салынған: токен құқықтарын тексеріңіз (Contents: Read and write)",
	errNotFound: "репозиторий табылмады немесе токеннің оған қол жеткізуі жоқ",
	errRateLimit: "GitHub API сұраныстар шегінен асып кетті, кейінірек қайталаңыз",
	errNetwork: "GitHub-қа қосылу мүмкін болмады",
	errTruncated: "репозиторий тым үлкен: GitHub файлдардың толық емес тізімін қайтарды",
	errMassDelete:
		"синхрондау тоқтатылды: жойылатын файлдар саны: {n}. Егер бұл әдейі болса, баптауларда жоюдан қорғауды өшіріңіз",

	settingLanguage: "Тіл",
	settingLanguageAuto: "Obsidian тіліндей",
	settingLanguageDesc: "Плагин интерфейсінің тілі. Команда атаулары Obsidian қайта іске қосылғаннан кейін жаңарады.",
	settingToken: "GitHub токені",
	settingTokenDesc: "Репозиторий мазмұнын оқу және жазу құқығы бар жеке қол жеткізу токені (Contents: Read and write).",
	settingOwner: "Репозиторий иесі",
	settingOwnerDesc: "GitHub-тағы пайдаланушы немесе ұйым аты.",
	settingRepo: "Репозиторий атауы",
	settingBranch: "Тармақ",
	settingBranchDesc: "Синхрондау жүретін тармақ. Егер ол жоқ болса, әдепкі тармақтан жасалады.",
	settingLoadBranches: "Тармақтар тізімін жүктеу",
	settingSyncOnStartup: "Іске қосылғанда синхрондау",
	settingSyncOnStartupDesc: "Obsidian іске қосылғанда қойманы автоматты түрде синхрондау.",
	settingSyncOnQuit: "Жабылғанда синхрондау",
	settingSyncOnQuitDesc: "Obsidian жабылғанда өзгерістерді GitHub-қа жіберу. Тек компьютерде: телефонда жүйе қолданбаны ескертусіз жабады.",
	settingSyncInterval: "Әр N минут сайын синхрондау",
	settingSyncIntervalDesc: "Мерзімді синхрондау аралығы, минутпен. 0 — өшірулі. Фондық синхрондау тек өзгерістер, қайшылықтар және қателер туралы хабарлайды.",
	settingNotices: "Хабарландыруларды көрсету",
	settingNoticesDesc: "Синхрондау күйі мен нәтижесін қалқымалы хабарландыруларда көрсету.",
	settingDeletionGuard: "Жаппай жоюдан қорғау",
	settingDeletionGuardDesc: "Синхрондау файлдардың жартысынан көбін жоятын болса, оны тоқтату.",
};

const STRINGS: Record<Language, Strings> = { kk, ru, en };

export const LOCALES: Record<Language, string> = {
	kk: "kk-KZ",
	ru: "ru-RU",
	en: "en-US",
};

/** Resolves "auto" to the Obsidian interface language, falling back to English. */
export function resolveLanguage(setting: LanguageSetting): Language {
	if (setting !== "auto") return setting;
	const app = getLanguage().toLowerCase();
	if (app.startsWith("kk")) return "kk";
	if (app.startsWith("ru")) return "ru";
	return "en";
}

export type Translate = (key: keyof Strings, vars?: Record<string, string | number>) => string;

export function translator(language: Language): Translate {
	const strings = STRINGS[language] ?? kk;
	return (key, vars) =>
		strings[key].replace(/\{(\w+)\}/g, (match, name: string) =>
			vars && name in vars ? String(vars[name]) : match
		);
}
