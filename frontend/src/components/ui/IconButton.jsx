import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import Spinner from './Spinner';
import styles from './IconButton.module.css';

const ICON_SIZE = { sm: 16, md: 18, lg: 20 };

// An icon-only button. `label` is required: it becomes the accessible name
// and the hover tooltip.
function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  loading = false,
  disabled = false,
  to,
  type = 'button',
  className,
  ref,
  ...rest
}) {
  const classes = cx(styles.iconButton, styles[variant], styles[size], className);
  const iconNode = loading ? (
    <Spinner size={ICON_SIZE[size]} />
  ) : (
    <Icon size={ICON_SIZE[size]} aria-hidden="true" />
  );

  if (to && !disabled) {
    return (
      <Link ref={ref} to={to} className={classes} aria-label={label} title={label} {...rest}>
        {iconNode}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {iconNode}
    </button>
  );
}

export default IconButton;
