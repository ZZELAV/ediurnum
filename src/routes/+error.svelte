<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/t.ts';
</script>

<main class="wrap">
	<div class="card">
		<p class="eyebrow">{page.status}</p>
		<h1>{page.status === 404 ? t('error.notFound') : page.status === 401 ? t('error.unauthorized') : t('common.error')}</h1>
		<p><a href="/">{t('common.back')}</a></p>
	</div>
</main>

<style>
	.wrap {
		max-width: 640px;
		margin: 10vh auto;
		padding: 0 1rem;
	}
</style>
