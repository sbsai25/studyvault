// Joins class names, skipping falsy values: cx('a', isOn && 'b') -> 'a b'
export const cx = (...classes) => classes.filter(Boolean).join(' ');
