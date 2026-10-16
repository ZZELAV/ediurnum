<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ask } from '#lib/confirm.svelte.ts';
	import { enhance } from '$app/forms';
	import { fmtDate, t } from '#lib/i18n/t.ts';
	import { CHANGELOG_URL, REPO_URL } from '#lib/changelog.ts';
	import { expiring } from '#lib/flash.svelte.ts';
	import PasswordInput from '#lib/components/PasswordInput.svelte';

	let { data, form } = $props();

	// Erscheinungsbild: ohne eigene Wahl folgt die App dem System; angezeigt wird das aktuell wirksame.
	let systemDark = $state(false);
	let chosenTheme = $state<'light' | 'dark' | null>(null);
	const themeValue = $derived(
		chosenTheme ?? (data.settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : data.settings.theme)
	);
	onMount(() => {
		const media = matchMedia('(prefers-color-scheme: dark)');
		systemDark = media.matches;
		const update = () => (systemDark = media.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	type FormResult = { section?: string; success?: string; error?: string; seconds?: number } | null;
	// Erfolgsmeldungen verschwinden nach ein paar Sekunden, Fehler bleiben stehen
	const shown = expiring(() => form as FormResult, (r) => !!r.error);
	const result = $derived(shown.current);

	function msg(section: string) {
		if (result?.section !== section) return null;
		if (result.error) return { kind: 'error', text: t(result.error, { seconds: result.seconds ?? 0 }) };
		if (result.success) return { kind: 'ok', text: t(result.success) };
		return null;
	}

	const keepValues = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>{t('settings.title')} · ediurnum</title></svelte:head>

{#snippet feedback(section: string)}
	{@const m = msg(section)}
	{#if m}<p class="notice" class:error={m.kind === 'error'} role="status" out:fade>{m.text}</p>{/if}
{/snippet}

<div class="view narrow">
	<header class="view-head">
		<h1>{t('settings.title')}</h1>
	</header>

		<nav class="toc" aria-label={t('settings.title')}>
			<a href="#general">{t('settings.general')}</a>
			<a href="#profile">{t('profile.title')}</a>
			<a href="#security">{t('settings.security')}</a>
			<a href="#backup">{t('settings.backup')}</a>
			<a href="#danger">{t('settings.danger')}</a>
			<a href="#about">{t('settings.about')}</a>
		</nav>

		<!-- Allgemein -->
		<section id="general" class="card">
			<h2>{t('settings.general')}</h2>
			{@render feedback('general')}
			<form method="POST" action="?/general" use:enhance={keepValues} class="grid">
				<div class="field">
					<label for="name">{t('settings.name')}</label>
					<input id="name" name="name" type="text" autocomplete="given-name" maxlength="60" value={data.settings.name} />
				</div>
				<div class="field">
					<label for="lang">{t('settings.language')}</label>
					<select id="lang" name="language" value={data.settings.language}>
						<option value="de">Deutsch</option>
						<option value="en">English</option>
					</select>
				</div>
				<div class="field">
					<label for="theme">{t('settings.theme')}</label>
					<select id="theme" value={themeValue} onchange={(e) => (chosenTheme = e.currentTarget.value as 'light' | 'dark')}>
						<option value="light">{t('settings.theme.light')}</option>
						<option value="dark">{t('settings.theme.dark')}</option>
					</select>
					<input type="hidden" name="theme" value={chosenTheme ?? data.settings.theme} />
				</div>
				<div class="field">
					<label for="sess">{t('settings.session')}</label>
					<input id="sess" name="sessionMinutes" type="number" min="5" max="720" value={data.settings.sessionMinutes} />
				</div>
				<div class="field">
					<label for="leave">{t('settings.leave')}</label>
					<select id="leave" name="leaveMinutes" value={String(data.settings.leaveMinutes)}>
						{#each [1, 5, 15, 0] as m (m)}<option value={String(m)}>{t(`settings.leave.${m}`)}</option>{/each}
					</select>
				</div>
				<p class="faint hint">{t('settings.leaveHint')}</p>
				{#if data.settings.theme === 'system' && !chosenTheme}<p class="faint hint">{t('settings.themeSystemHint')}</p>{/if}
				<div class="field check">
					<label class="switch-label">
						<input type="checkbox" role="switch" name="focusMode" checked={data.settings.focusMode} />
						<span>{t('settings.focusMode')}</span>
					</label>
					<p class="faint">{t('settings.focusModeHint')}</p>
				</div>
				<div class="field check">
					<label class="switch-label">
						<input type="checkbox" role="switch" name="welcome" checked={!data.settings.welcomeHidden} />
						<span>{t('settings.welcome')}</span>
					</label>
					<p class="faint">{t('settings.welcomeHint')}</p>
				</div>
				<div><button class="btn">{t('common.save')}</button></div>
			</form>
		</section>

		<!-- Über mich -->
		<section id="profile" class="card">
			<h2>{t('profile.title')}</h2>
			<p class="faint">{t('settings.profileIntro')}</p>
			{#if data.profile.filled}
				<p>{t('profile.updated', { date: fmtDate(data.profile.updatedAt, 'medium') })}</p>
			{:else}
				<p>{t('settings.profileEmpty')}</p>
			{/if}
			<a class="btn ghost" href="/profile">{data.profile.filled ? t('settings.profileEdit') : t('settings.profileFill')}</a>
		</section>

		<!-- Sicherheit -->
		<section id="security" class="card">
			<h2>{t('settings.security')}</h2>
			<p class="faint">{t('settings.recoveryHint')}</p>

			<h3>{t('settings.recoveryTest')}</h3>
			<p class="faint">{t('settings.recoveryTestIntro')}</p>
			{@render feedback('recovery')}
			<form method="POST" action="?/recoveryTest" use:enhance class="grid">
				<div class="field">
					<label for="rk">{t('setup.recoveryKey')}</label>
					<input id="rk" name="recoveryKey" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required />
				</div>
				<div><button class="btn ghost">{t('settings.recoveryTestButton')}</button></div>
			</form>

			<h3>{t('settings.changePassword')}</h3>
			{@render feedback('password')}
			<form method="POST" action="?/password" use:enhance class="grid">
				<!-- Für Passwortmanager: der Vorname als Benutzername -->
				<input class="visually-hidden" type="text" name="username" value={data.settings.name} autocomplete="username" tabindex="-1" aria-hidden="true" readonly />
				<div class="field">
					<label for="cur">{t('settings.currentPassword')}</label>
					<PasswordInput id="cur" name="current" autocomplete="current-password" required />
				</div>
				<div class="field">
					<label for="npw">{t('settings.newPassword')}</label>
					<PasswordInput id="npw" name="password" autocomplete="new-password" minlength={10} required />
				</div>
				<div class="field">
					<label for="npw2">{t('settings.newPasswordConfirm')}</label>
					<PasswordInput id="npw2" name="confirm" autocomplete="new-password" minlength={10} required />
				</div>
				<div><button class="btn">{t('settings.changePassword')}</button></div>
			</form>

			<h3>{t('settings.pin')}</h3>
			<p class="faint">{t('settings.pinIntro')}</p>
			<p>{data.hasPin ? t('settings.pinActive', { count: data.lockedCount }) : t('settings.pinNone')}</p>
			{@render feedback('pin')}
			<form method="POST" action="?/pin" use:enhance class="grid">
				{#if data.hasPin}
					<div class="field">
						<label for="cpin">{t('settings.currentPin')}</label>
						<PasswordInput id="cpin" name="current" inputmode="numeric" autocomplete="off" required />
					</div>
				{/if}
				<div class="field">
					<label for="npin">{t('settings.newPin')}</label>
					<PasswordInput id="npin" name="pin" inputmode="numeric" pattern={'[0-9]{4,12}'} autocomplete="off" required />
				</div>
				<div class="field">
					<label for="npin2">{t('settings.newPinConfirm')}</label>
					<PasswordInput id="npin2" name="confirm" inputmode="numeric" autocomplete="off" required />
				</div>
				<div><button class="btn">{data.hasPin ? t('settings.pinChange') : t('settings.pinSet')}</button></div>
			</form>
		</section>

		<!-- Backup -->
		<section id="backup" class="card">
			<h2>{t('settings.backup')}</h2>
			<p class="faint">{t('settings.backupIntro')}</p>
			<a class="btn" href="/api/export/backup" download>{t('settings.backupDownload')}</a>
			<p class="faint" style="margin-top: 0.6rem">{t('settings.backupRestoreHint')}</p>

			<h3>{t('settings.plainExport')}</h3>
			<p class="notice error">{t('settings.plainExportWarning')}</p>
			<div class="row">
				<a class="btn ghost small" href="/api/export/plain?format=md" download>{t('settings.exportMd')}</a>
				<a class="btn ghost small" href="/api/export/plain?format=json" download>{t('settings.exportJson')}</a>
				<a class="btn ghost small" href="/api/export/plain?format=pdf" download>{t('settings.exportPdf')}</a>
			</div>
		</section>

		<!-- Tagebuch löschen -->
		<section id="danger" class="card danger-zone">
			<h2>{t('settings.danger')}</h2>
			<p class="faint">{t('settings.dangerIntro')}</p>
			{@render feedback('danger')}
			<form
				method="POST"
				action="?/purge"
				use:enhance={async ({ submitter, cancel }) => {
					const all = submitter?.getAttribute('value') === 'all';
					const ok = await ask(t(all ? 'settings.resetConfirm' : 'settings.purgeConfirm'), {
						confirmLabel: t(all ? 'settings.resetAll' : 'settings.purgeContent'),
						danger: true
					});
					if (!ok) return cancel();
					return async ({ update }) => update();
				}}
			>
				<div class="field purge-pw">
					<label for="purge-pw">{t('settings.currentPassword')}</label>
					<PasswordInput id="purge-pw" name="password" autocomplete="current-password" required />
				</div>
				<div class="purge-option">
					<button class="btn danger" name="mode" value="content">{t('settings.purgeContent')}</button>
					<p class="faint">{t('settings.purgeContentHint')}</p>
				</div>
				<div class="purge-option">
					<button class="btn danger" name="mode" value="all">{t('settings.resetAll')}</button>
					<p class="faint">{t('settings.resetAllHint')}</p>
				</div>
			</form>
		</section>

		<!-- Über -->
		<section id="about" class="card">
			<h2>{t('settings.about')}</h2>
			<p>{t('common.version')} {data.version}</p>
			{#if data.changelog}
				<details>
					<summary>
						{t('settings.changelogLatest', { version: data.changelog.version })}
						{#if data.changelog.date}<span class="faint">· {fmtDate(data.changelog.date, 'medium')}</span>{/if}
					</summary>
					<div class="prose changelog">{@html data.changelog.html}</div>
				</details>
			{/if}
			<p class="faint" style="margin-top: 0.75rem">
				<a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">{t('settings.changelogAll')} ↗</a>
			</p>
			<p class="faint">
				<a href={REPO_URL} target="_blank" rel="noopener noreferrer">{t('settings.repo')} ↗</a>
				<br />{t('settings.repoHint')}
			</p>
		</section>
</div>

<style>
	.toc {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.25rem;
	}
	.toc a {
		font-size: 0.85rem;
		padding: 0.3rem 0.8rem;
		border-radius: 999px;
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		text-decoration: none;
		color: var(--ink-soft);
	}
	.toc a:hover {
		color: var(--ink);
		border-color: var(--accent);
	}
	section {
		margin-bottom: 1rem;
		scroll-margin-top: 4.5rem;
	}
	section > h2 {
		margin-bottom: 0.75rem;
	}
	h3 {
		margin-top: 1.5rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
		gap: 0 1.2rem;
		align-items: end;
	}
	.grid > div:last-child {
		margin-bottom: 1.4rem;
	}
	.check {
		grid-column: 1 / -1;
	}
	/* Hinweis bündig mit dem Text neben dem Schalter (Schalterbreite + Abstand) */
	.check p {
		margin: 0.2rem 0 0 calc(2.4rem + 0.55rem);
	}
	.switch-label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--ink);
		margin: 0;
	}
	.hint {
		grid-column: 1 / -1;
		margin: -0.6rem 0 1rem;
	}
	.danger-zone {
		border-color: color-mix(in srgb, var(--danger) 35%, var(--paper-edge));
	}
	.purge-pw {
		max-width: 22rem;
	}
	.purge-option {
		display: grid;
		gap: 0.35rem;
		justify-items: start;
		margin-bottom: 1rem;
	}
	.purge-option:last-child {
		margin-bottom: 0;
	}
	.purge-option p {
		margin: 0;
	}
	.changelog {
		font-size: 0.92rem;
	}
	summary {
		cursor: pointer;
	}
</style>
