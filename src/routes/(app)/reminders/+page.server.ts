import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { listEntryMeta } from '$lib/server/entries';
import {
	deleteCustomReminder,
	listCustomReminders,
	listDevices,
	loadReminders,
	saveCustomReminder,
	saveReminders,
	setCustomReminderEnabled,
	vapidPublicKey
} from '$lib/server/reminders';
import { nextReview, sanitizeReminders, suggestionsFor } from '$lib/reminders';

export const load: PageServerLoad = () => {
	const now = new Date();
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	const cfg = loadReminders();
	const metas = listEntryMeta();
	const suggestions = suggestionsFor(today, metas, cfg);
	return {
		now: { date: today, minutes },
		custom: listCustomReminders(now),
		reviews: {
			gefuehl: {
				...cfg.gefuehl,
				due: suggestions.gefuehl.suggested,
				next: nextReview('gefuehl', metas, cfg, today, minutes)
			},
			wachstum: {
				...cfg.wachstum,
				due: suggestions.wachstum.suggested,
				next: nextReview('wachstum', metas, cfg, today, minutes)
			}
		},
		push: {
			publicKey: vapidPublicKey(),
			devices: listDevices().map((d) => ({ endpoint: d.endpoint, label: d.label, createdAt: d.createdAt }))
		}
	};
};

export const actions: Actions = {
	/** Zeitplan der Rückblicke (Gefühl wöchentlich, Weiterentwicklung monatlich). */
	reviews: async ({ request, locals }) => {
		const form = await request.formData();
		const day = String(form.get('wachstumDay') ?? 'last');
		saveReminders(
			sanitizeReminders(
				{
					gefuehl: {
						enabled: form.get('gefuehlEnabled') === 'on',
						weekday: Number(form.get('gefuehlWeekday')),
						time: String(form.get('gefuehlTime') ?? '')
					},
					wachstum: {
						enabled: form.get('wachstumEnabled') === 'on',
						day: day === 'last' ? 'last' : Number(day),
						time: String(form.get('wachstumTime') ?? '')
					},
					custom: loadReminders().custom
				},
				locals.lang
			)
		);
		return { section: 'reviews', success: 'reminders.reviewsSaved' };
	},

	save: async ({ request }) => {
		const form = await request.formData();
		const day = String(form.get('day') ?? '1');
		const result = saveCustomReminder({
			id: String(form.get('id') ?? ''),
			title: form.get('title'),
			body: form.get('body'),
			enabled: form.get('enabled') !== 'false',
			repeat: form.get('repeat'),
			date: form.get('date'),
			weekdays: form.getAll('weekdays').map(Number),
			day: day === 'last' ? 'last' : Number(day),
			time: form.get('time')
		});
		if (typeof result === 'string') return fail(400, { error: result });
		return { success: 'reminders.saved', id: result.id };
	},

	toggle: async ({ request }) => {
		const form = await request.formData();
		setCustomReminderEnabled(String(form.get('id') ?? ''), form.get('enabled') === 'true');
		return { success: null };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		deleteCustomReminder(String(form.get('id') ?? ''));
		return { success: 'reminders.deleted' };
	}
};
