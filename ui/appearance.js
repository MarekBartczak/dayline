// Portable appearance choices. Window opacity fades the entire popup actor.
const accents = {
    ubuntu: {color: '#e95420', dark: '#f8b391', light: '#ad370a', soft: '#3e2e27', pale: '#fff0e6'},
    violet: {color: '#8a5ac2', dark: '#cfb3fa', light: '#7540a4', soft: '#362c47', pale: '#f2e9fc'},
    blue: {color: '#2875c5', dark: '#a9d0ff', light: '#1b60a2', soft: '#26384b', pale: '#e7f2ff'},
    green: {color: '#25805a', dark: '#a1e5bd', light: '#196b46', soft: '#253d32', pale: '#e7f6ed'},
    rose: {color: '#be3f75', dark: '#ffb6d1', light: '#a72c65', soft: '#442c38', pale: '#ffeaf2'},
};
const systemColors = {orange: 'ubuntu', purple: 'violet', blue: 'blue', teal: 'blue', green: 'green', yellow: 'ubuntu', red: 'rose', pink: 'rose', slate: 'blue'};

export function resolveAccent(choice, systemColor = 'orange') {
    const name = choice === 'system' ? systemColors[systemColor] ?? 'ubuntu' : choice;
    return {name: accents[name] ? name : 'ubuntu', ...(accents[name] ?? accents.ubuntu)};
}

export function windowOpacity(percent = 100) {
    const opacity = Number.isFinite(percent) ? percent : 100;
    return Math.round(Math.max(20, Math.min(100, opacity)) * 255 / 100);
}

export function backgroundColor(accent, light) {
    const color = light ? accent.name === 'ubuntu' ? '#faf9f7' : '#faf9fd' : accent.name === 'ubuntu' ? '#242424' : '#20212d';
    const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
    return `rgba(${rgb.join(', ')}, 1)`;
}
