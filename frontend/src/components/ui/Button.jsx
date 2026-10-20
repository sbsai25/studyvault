import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import Spinner from './Spinner';
import styles from './Button.module.css';

const ICON_SIZE = { sm: 16, md: 18, lg: 20 };

// variant: primary | secondary | ghost | soft | danger | dangerGhost
// Pass `to` to render a router link styled as a button.
function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  disabled = false,
  to,
  type = 'button',
  className,
  children,
  ref,
  ...rest
}) {
  const classes = cx(styles.button, styles[variant], styles[size], block && styles.block, className);
  const iconSize = ICON_SIZE[size];
  const content = (
    <>
      {loading ? (
        <Spinner size={iconSize} />
      ) : (
        Icon && <Icon className={styles.icon} size={iconSize} aria-hidden="true" />
      )}
      {children != null && <span className={styles.label}>{children}</span>}
      {IconRight && !loading && <IconRight className={styles.icon} size={iconSize} aria-hidden="true" />}
    </>
  );

  if (to && !disabled && !loading) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}

export default Button;
