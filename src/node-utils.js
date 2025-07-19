function fnv1aHash(str) {
	let hash = 0x811c9dc5n;
	for (let i = 0; i < str.length; i++) {
		hash = BigInt.asIntN(32, hash ^ BigInt(str.charCodeAt(i)));
		hash = BigInt.asIntN(32, hash * 0x01000193n);
	}

	return Number(hash & 0xFFFFFFFFn);
}

export function getColourForName(name, saturation = 60, lightness = 50) {
	const hash = fnv1aHash(name);

	return `hsl(${hash % 360}deg, ${saturation}%, ${lightness}%)`;
}

export function getNameIconLabel(name) {
	if (typeof name !== 'string' || name.length === 0) {
		return ''
	}

	const match = name.match(/\p{Emoji_Presentation}/u);
	if (!match) {
		name = name.trim();
		const segments = name.split(' ');
		if (segments.length == 1) {
			return name.charAt(0);
		}
		return `${segments.at(0)[0]}${segments.at(-1)[0]}`;
	}

	return match[0];
}