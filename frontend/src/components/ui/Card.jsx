import { cx } from '../../lib/cx';
import styles from './Card.module.css';

// padding: none | sm | md | lg. `interactive` adds hover feedback for cards
// that are clickable as a whole.
function Card({ as: Component = 'div', padding = 'md', interactive = false, className, children, ...rest }) {
  return (
    <Component
      className={cx(styles.card, styles[`pad-${padding}`], interactive && styles.interactive, className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default Card;
