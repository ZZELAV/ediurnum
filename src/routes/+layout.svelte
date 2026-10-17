<script lang="ts">
	import '@fontsource-variable/lora';
	import '@fontsource-variable/lora/wght-italic.css';
	import '@fontsource-variable/inter';
	import '../app.css';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

	let { data, children } = $props();

	// apply theme and language right away when they change
	// (the server only puts them into the HTML on the first load).
	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = data.theme;
		root.lang = data.lang;
	});
</script>

{@render children()}

<ConfirmDialog />
