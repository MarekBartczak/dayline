import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {monthDays, shiftMonth, localDate} from '../model.js';
import {box, label, button, iconButton, formatDate} from './widgets.js';

export function calendar(selected, data, onSelect, onMonth) {
    const root = box(true, 'dayline-calendar');
    const header = box(false, 'dayline-calendar-header');
    header.add_child(iconButton('Poprzedni miesiąc', 'go-previous-symbolic', () => onMonth(shiftMonth(selected, -1))));
    const title = label(formatDate(selected, {month: 'long', year: 'numeric'}), 'dayline-calendar-title');
    title.x_expand = true;
    title.x_align = Clutter.ActorAlign.CENTER;
    header.add_child(title);
    header.add_child(iconButton('Następny miesiąc', 'go-next-symbolic', () => onMonth(shiftMonth(selected, 1))));
    root.add_child(header);
    const grid = new St.Widget({layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.HORIZONTAL}), x_expand: true});
    const layout = grid.layout_manager;
    ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].forEach((name, index) => {
        const day = label(name, 'dayline-weekday');
        day.x_expand = true;
        day.x_align = Clutter.ActorAlign.CENTER;
        layout.attach(day, index, 0, 1, 1);
    });
    const today = localDate();
    const openDates = new Set(data.tasks.filter(item => !item.done).map(item => item.date));
    monthDays(selected).forEach((date, index) => {
        const style = ['dayline-day'];
        if (date.slice(0, 7) !== selected.slice(0, 7)) style.push('dayline-day-outside');
        if (date === today) style.push('dayline-day-today');
        if (date === selected) style.push('dayline-day-selected');
        const day = button(formatDate(date), () => onSelect(date), style.join(' '));
        day.x_expand = true;
        const content = box(true, 'dayline-day-content');
        const number = label(String(Number(date.slice(-2))));
        number.x_align = Clutter.ActorAlign.CENTER;
        content.add_child(number);
        const dot = new St.Widget({style_class: openDates.has(date) ? 'dayline-dot dayline-dot-active' : 'dayline-dot', x_align: Clutter.ActorAlign.CENTER});
        content.add_child(dot);
        day.set_child(content);
        layout.attach(day, index % 7, Math.floor(index / 7) + 1, 1, 1);
    });
    root.add_child(grid);
    return root;
}
