import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import changelog from '../../../../CHANGELOG.md?raw';
import { AUTO_REGION, isLang, isRegion } from '#lib/i18n/index.ts';
import { renderMarkdown } from '#lib/markdown.ts';
import { changelogSection } from '#lib/changelog.ts';
import { isEmptyProfile } from '#lib/profile.ts';
import { loadProfile } from '#lib/server/profile.ts';
import { log } from '#lib/server/log.ts';
import { presetById } from '#lib/ai-presets.ts';
import { SESSION_COOKIE, setDisplayCookies, settingsLocale } from '#lib/server/auth.ts';
import { purgeContent, resetAll } from '#lib/server/purge.ts';
import { countLocked, rekeyLocked } from '#lib/server/entries.ts';
import { transaction } from '#lib/server/db.ts';
import { parseRecoveryKey } from '#lib/server/crypto.ts';
import { isTheme, loadSettings, publicAgent, saveSettings } from '#lib/server/settings.ts';
import { validateNewPassword, validatePin } from '#lib/server/validation.ts';
import {
	closePinInOtherSessions,
	destroyOtherSessions,
	hasPin,
	prepareNewPin,
	registerFailure,
	registerSuccess,
	setPassword,
	throttleRemaining,
	unlockPinForSession,
	unlockWithPassword,
	verifyPin
} from '#lib/server/vault.ts';
import { setReminderLang } from '#lib/server/reminders.ts';
import type { AiAgent } from '#lib/types.ts';
import { todayIso } from '#lib/dates.ts';

export const load: PageServerLoad = ({ locals }) => {
	const settings = loadSettings(locals.session!.dek);
	const profile = loadProfile(locals.session!.dek);
	const latest = changelogSection(changelog, __APP_VERSION__);
	return {
		settings: { ...settings, agents: settings.agents.map(publicAgent) },
		lockedCount: countLocked(),
		today: todayIso(),
		profile: { filled: !isEmptyProfile(profile), updatedAt: profile.updatedAt },
		changelog: latest ? { version: latest.version, date: latest.date, html: renderMarkdown(latest.body) } : null
	};
};

const LEAVE_MINUTES = [1, 5, 15, 0];

export const actions: Actions = {
	general: async (event) => {
		const { request, locals, cookies } = event;
		const session = locals.session!;
		const form = await request.formData();
		const settings = loadSettings(session.dek);
		const language = form.get('language');
		const theme = form.get('theme');
		const leave = Number(form.get('leaveMinutes'));
		settings.name = String(form.get('name') ?? '').trim().slice(0, 60);
		if (isLang(language)) settings.language = language;
		// a region of another language (e.g. after switching the language) becomes "automatic"
		const region = form.get('region');
		settings.region = isRegion(settings.language, region) ? region : AUTO_REGION;
		if (isTheme(theme)) settings.theme = theme;
		settings.focusMode = form.get('focusMode') === 'on';
		settings.welcomeHidden = form.get('welcome') !== 'on';
		if (LEAVE_MINUTES.includes(leave)) settings.leaveMinutes = leave;
		settings.locale = settingsLocale(event, settings).locale;
		saveSettings(session.dek, settings);
		session.awayMs = settings.leaveMinutes * 60 * 1000;
		setDisplayCookies(cookies, settings);
		setReminderLang(settings.locale);
		return { section: 'general', success: 'settings.saved' };
	},

	/** Delete the journal: only content (mode=content) or reset everything (mode=all). The password is required. */
	purge: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const mode = form.get('mode') === 'all' ? 'all' : 'content';
		const wait = throttleRemaining('purge');
		if (wait > 0) return fail(429, { section: 'danger', error: 'error.throttled', seconds: wait });
		const dek = await unlockWithPassword(String(form.get('password') ?? ''));
		if (!dek || !dek.equals(locals.session!.dek)) {
			registerFailure('purge');
			return fail(400, { section: 'danger', error: 'error.wrongPassword' });
		}
		registerSuccess('purge');
		dek.fill(0);
		if (mode === 'all') {
			resetAll();
			log.info('journal reset completely');
			cookies.delete(SESSION_COOKIE, { path: '/' });
			redirect(303, '/setup');
		}
		purgeContent();
		log.info('all entries deleted');
		return { section: 'danger', success: 'settings.purgeDone' };
	},

	password: async ({ request, locals }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const err = validateNewPassword(next, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { section: 'password', error: err });
		const wait = throttleRemaining('password-change');
		if (wait > 0) return fail(429, { section: 'password', error: 'error.throttled', seconds: wait });
		const dek = await unlockWithPassword(current);
		if (!dek || !dek.equals(locals.session!.dek)) {
			registerFailure('password-change');
			return fail(400, { section: 'password', error: 'error.wrongPassword' });
		}
		registerSuccess('password-change');
		await setPassword(dek, next);
		dek.fill(0);
		// whoever changes the password often wants to lock out other devices (e.g. if someone might know it)
		const closed = destroyOtherSessions(locals.session!);
		log.info('password changed', { otherSessionsClosed: closed });
		return { section: 'password', success: 'settings.passwordChanged' };
	},

	/** Checks the recovery key without changing anything. */
	recoveryTest: async ({ request, locals }) => {
		const form = await request.formData();
		const wait = throttleRemaining('recovery-test');
		if (wait > 0) return fail(429, { section: 'recovery', error: 'error.throttled', seconds: wait });
		let key: Buffer;
		try {
			key = parseRecoveryKey(String(form.get('recoveryKey') ?? ''));
		} catch (e) {
			return fail(400, { section: 'recovery', error: (e as Error).message });
		}
		const ok = key.equals(locals.session!.dek);
		key.fill(0);
		if (!ok) {
			registerFailure('recovery-test');
			return fail(400, { section: 'recovery', error: 'recovery.wrongKey' });
		}
		registerSuccess('recovery-test');
		return { section: 'recovery', success: 'settings.recoveryTestOk' };
	},

	pin: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const newPin = String(form.get('pin') ?? '');
		const err = validatePin(newPin, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { section: 'pin', error: err });

		let oldKey: Buffer | null = null;
		if (hasPin()) {
			const wait = throttleRemaining('pin');
			if (wait > 0) return fail(429, { section: 'pin', error: 'error.throttled', seconds: wait });
			oldKey = await verifyPin(session.dek, String(form.get('current') ?? ''));
			if (!oldKey) {
				registerFailure('pin');
				return fail(400, { section: 'pin', error: 'error.wrongPin' });
			}
			registerSuccess('pin');
		}
		const { lockKey, commit } = await prepareNewPin(session.dek, newPin);
		transaction(() => {
			if (oldKey) rekeyLocked(oldKey, lockKey);
			commit();
		});
		unlockPinForSession(session, lockKey);
		closePinInOtherSessions(session);
		oldKey?.fill(0);
		log.info(oldKey ? 'PIN changed' : 'PIN set');
		return { section: 'pin', success: 'settings.pinSaved' };
	},

	saveAgent: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const settings = loadSettings(session.dek);
		const id = String(form.get('id') ?? '');
		const existing = settings.agents.find((a) => a.id === id);
		const preset = presetById(String(form.get('preset') ?? 'custom'));
		const tone = String(form.get('tone') ?? 'balanced');
		const agent: AiAgent = {
			id: existing?.id ?? randomUUID(),
			name: String(form.get('name') ?? '').trim().slice(0, 80) || preset.label,
			preset: preset.id,
			provider: preset.provider,
			baseUrl: String(form.get('baseUrl') ?? '').trim(),
			model: String(form.get('model') ?? '').trim(),
			apiKey: String(form.get('apiKey') ?? '').trim() || existing?.apiKey || '',
			persona: String(form.get('persona') ?? '').slice(0, 8000),
			tone: tone === 'gentle' || tone === 'direct' ? tone : 'balanced',
			maxFocusPoints: Math.min(7, Math.max(1, Number(form.get('maxFocusPoints')) || 4))
		};
		settings.agents = existing ? settings.agents.map((a) => (a.id === agent.id ? agent : a)) : [...settings.agents, agent];
		if (!settings.defaultAgentId || !settings.agents.some((a) => a.id === settings.defaultAgentId)) {
			settings.defaultAgentId = agent.id;
		}
		saveSettings(session.dek, settings);
		return { section: 'ai', success: 'settings.aiSaved' };
	},

	deleteAgent: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const settings = loadSettings(session.dek);
		settings.agents = settings.agents.filter((a) => a.id !== form.get('id'));
		if (!settings.agents.some((a) => a.id === settings.defaultAgentId)) settings.defaultAgentId = settings.agents[0]?.id ?? null;
		saveSettings(session.dek, settings);
		return { section: 'ai' };
	},

	defaultAgent: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const settings = loadSettings(session.dek);
		const id = String(form.get('id') ?? '');
		if (settings.agents.some((a) => a.id === id)) settings.defaultAgentId = id;
		saveSettings(session.dek, settings);
		return { section: 'ai' };
	}
};
