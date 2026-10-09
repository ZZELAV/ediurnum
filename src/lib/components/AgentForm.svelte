<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { AI_PRESETS, presetById } from '$lib/ai-presets';
	import { api } from '$lib/client';
	import { t } from '$lib/i18n/t';
	import type { PublicAiAgent } from '$lib/types';

	let { agent, onclose }: { agent: PublicAiAgent | null; onclose: () => void } = $props();

	const initial = untrack(() => agent);
	let preset = $state(initial?.preset ?? 'anthropic');
	let name = $state(initial?.name ?? '');
	let baseUrl = $state(initial?.baseUrl ?? presetById('anthropic').baseUrl);
	let model = $state(initial?.model ?? presetById('anthropic').defaultModel);
	let apiKey = $state('');
	let tone = $state(initial?.tone ?? 'balanced');
	let persona = $state(initial?.persona ?? '');
	let maxFocusPoints = $state(initial?.maxFocusPoints ?? 4);
	let models = $state<string[]>([]);
	let modelsMsg = $state<string | null>(null);
	let loadingModels = $state(false);

	const p = $derived(presetById(preset));

	function changePreset() {
		const np = presetById(preset);
		baseUrl = np.baseUrl;
		model = np.defaultModel;
		models = [];
		modelsMsg = null;
	}

	async function loadModels() {
		loadingModels = true;
		modelsMsg = null;
		const res = await api<{ models: string[] }>('/api/ai/models', 'POST', {
			id: initial?.id,
			preset,
			provider: p.provider,
			baseUrl,
			apiKey
		});
		loadingModels = false;
		if (res.ok) {
			models = res.data.models;
			modelsMsg = t('settings.aiModelsLoaded', { count: models.length });
		} else {
			modelsMsg = t(res.error) + (res.data.detail ? ` (${res.data.detail})` : '');
		}
	}
</script>

<form
	method="POST"
	action="?/saveAgent"
	class="agent-form card"
	use:enhance={() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') onclose();
		}}
>
	<h3>{initial ? t('settings.aiEdit') : t('settings.aiAdd')}</h3>
	<input type="hidden" name="id" value={initial?.id ?? ''} />

	<div class="grid">
		<div class="field">
			<label for="ag-name">{t('settings.aiName')}</label>
			<input id="ag-name" name="name" type="text" bind:value={name} placeholder={t('settings.aiNameHint')} />
		</div>
		<div class="field">
			<label for="ag-preset">{t('settings.aiProvider')}</label>
			<select id="ag-preset" name="preset" bind:value={preset} onchange={changePreset}>
				{#each AI_PRESETS as pr (pr.id)}<option value={pr.id}>{pr.label}</option>{/each}
			</select>
		</div>
	</div>

	{#if p.provider !== 'anthropic' || baseUrl}
		<div class="field">
			<label for="ag-url">{t('settings.aiBaseUrl')}</label>
			<input id="ag-url" name="baseUrl" type="url" bind:value={baseUrl} placeholder="https://…/v1" />
			<p class="faint">{t('settings.aiBaseUrlHint')}</p>
		</div>
	{:else}
		<input type="hidden" name="baseUrl" value="" />
	{/if}

	<div class="field">
		<label for="ag-key">
			{t('settings.aiApiKey')}
			{#if !p.needsKey}<span class="faint">({t('common.optional')})</span>{/if}
			{#if initial?.hasApiKey}<span class="chip">{t('settings.aiApiKeyStored')}</span>{/if}
		</label>
		<input id="ag-key" name="apiKey" type="password" autocomplete="off" bind:value={apiKey} />
		{#if initial?.hasApiKey}<p class="faint">{t('settings.aiApiKeyKeep')}</p>{/if}
	</div>

	<div class="field">
		<label for="ag-model">{t('settings.aiModel')}</label>
		<div class="row nowrap">
			<input id="ag-model" name="model" type="text" list="ag-models" bind:value={model} required spellcheck="false" />
			<button type="button" class="btn ghost small" onclick={loadModels} disabled={loadingModels}>
				{loadingModels ? t('common.loading') : t('settings.aiLoadModels')}
			</button>
		</div>
		<datalist id="ag-models">{#each models as m (m)}<option value={m}></option>{/each}</datalist>
		{#if modelsMsg}<p class="faint">{modelsMsg}</p>{/if}
	</div>

	<div class="grid">
		<div class="field">
			<label for="ag-tone">{t('settings.aiTone')}</label>
			<select id="ag-tone" name="tone" bind:value={tone}>
				<option value="gentle">{t('settings.aiTone.gentle')}</option>
				<option value="balanced">{t('settings.aiTone.balanced')}</option>
				<option value="direct">{t('settings.aiTone.direct')}</option>
			</select>
		</div>
		<div class="field">
			<label for="ag-n">{t('settings.aiFocusCount')}</label>
			<input id="ag-n" name="maxFocusPoints" type="number" min="1" max="7" bind:value={maxFocusPoints} />
		</div>
	</div>

	<div class="field">
		<label for="ag-persona">{t('settings.aiPersona')}</label>
		<textarea id="ag-persona" name="persona" rows="4" bind:value={persona} placeholder={t('settings.aiPersonaHint')}></textarea>
	</div>

	<div class="row">
		<button class="btn">{t('common.save')}</button>
		<button type="button" class="btn quiet" onclick={onclose}>{t('common.cancel')}</button>
	</div>
</form>

<style>
	.agent-form {
		margin: 1rem 0;
		background: var(--paper);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0 1rem;
	}
	.nowrap {
		flex-wrap: nowrap;
	}
	label .chip {
		margin-left: 0.4rem;
	}
</style>
