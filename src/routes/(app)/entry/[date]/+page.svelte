<script lang="ts">
	import EntryEditor from '#lib/components/EntryEditor.svelte';
	import { fmtDate } from '#lib/i18n/t.ts';

	let { data } = $props();
	const editorKey = $derived(`${data.date}|${data.entry?.content === null ? 'closed' : 'open'}`);
</script>

<svelte:head><title>{fmtDate(data.date, 'medium')} · ediurnum</title></svelte:head>

<!-- Das Umblättern zwischen Tagen steuert (app)/+layout.svelte über View Transitions. -->
{#key editorKey}
	<EntryEditor
		date={data.date}
		today={data.today}
		entry={data.entry}
		suggestions={data.suggestions}
		focus={data.focus}
		hasPin={data.hasPin}
		pinOpen={data.pinUnlockedUntil > 0}
		prev={data.prev}
		next={data.next}
	/>
{/key}
