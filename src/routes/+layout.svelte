<script lang="ts">
	import '@fontsource-variable/lora';
	import '@fontsource-variable/lora/wght-italic.css';
	import '@fontsource-variable/inter';
	import '../app.css';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

	let { data, children } = $props();

	// Erscheinungsbild und Sprache sofort übernehmen, wenn sie sich ändern
	// (der Server setzt sie nur beim ersten Laden ins HTML).
	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = data.theme;
		root.lang = data.lang;
	});
</script>

{@render children()}

<ConfirmDialog />
