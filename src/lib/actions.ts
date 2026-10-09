/** Passt die Höhe eines Textfelds an den Inhalt an (Fallback für Browser ohne field-sizing). */
export function autosize(node: HTMLTextAreaElement) {
	if (CSS.supports('field-sizing', 'content')) return;
	const resize = () => {
		node.style.height = 'auto';
		node.style.height = node.scrollHeight + 'px';
	};
	resize();
	node.addEventListener('input', resize);
	return {
		destroy: () => node.removeEventListener('input', resize)
	};
}
