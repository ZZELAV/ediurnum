<script lang="ts">
	import '@fontsource-variable/lora';
	import '@fontsource-variable/lora/wght-italic.css';
	import '@fontsource-variable/inter';
	import '../app.css';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

	let { data, children } = $props();

	// apply theme and language right away when they change
	// (the server only puts them into the HTML on the first load).
	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = data.theme;
		root.lang = data.locale;
	});

	// time zone of the device as a cookie: the server derives the country for the format from it
	// (e.g. Europe/Zurich → de-CH) when the browser language doesn't tell it
	onMount(() => {
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
			if (!tz || (current && decodeURIComponent(current) === tz)) return;
			document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=strict`;
			invalidateAll();
		} catch {
			// no time zone – the browser language and the default apply
		}
	});
</script>

{@render children()}

<ConfirmDialog />
