import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cx } from '../../lib/cx';
import Logo, { LogoMark } from '../brand/Logo';
import Dialog from '../ui/Dialog';
import IconButton from '../ui/IconButton';
import Spinner from '../ui/Spinner';
import UploadProvider from '../library/upload/UploadProvider';
import { NAV_ITEMS } from './navItems';
import styles from './AppShell.module.css';

const MOBILE_QUERY = '(max-width: 767px)';

function NavList({ onNavigate }) {
  return (
    <nav aria-label="Main" className={styles.nav}>
      <ul className={styles.navList}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => cx(styles.navLink, isActive && styles.active)}
              onClick={onNavigate}
            >
              <Icon size={20} aria-hidden="true" />
              <span className={styles.navLabel}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AccountBlock({ email, onSignOut }) {
  return (
    <div className={styles.account}>
      <span className={styles.avatar} aria-hidden="true" title={email}>
        {email?.[0] ?? '?'}
      </span>
      <div className={styles.accountText}>
        <span className={styles.accountLabel}>Signed in as</span>
        <span className={styles.email} title={email}>
          {email}
        </span>
      </div>
      <IconButton icon={LogOut} label="Sign out" size="sm" onClick={onSignOut} />
    </div>
  );
}

function PageFallback() {
  return (
    <div className={styles.fallback}>
      <Spinner size={22} label="Loading page" />
    </div>
  );
}

// The signed-in layout: sidebar on desktop, an icon rail on tablets and a
// top bar with a slide-in drawer on phones.
function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef(null);
  const section = location.pathname.split('/')[1];
  const previousSection = useRef(section);

  // Moving to another section: start at the top and put keyboard and screen
  // reader focus at the start of the new page
  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [section]);

  // The drawer only exists on phones; close it if the window gets wider
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = (event) => {
      if (!event.matches) setDrawerOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>

      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand} aria-label="StudyVault dashboard">
          <Logo size={30} className={styles.brandFull} />
          <LogoMark size={34} className={styles.brandMark} />
        </Link>
        <NavList />
        <AccountBlock email={user?.email} onSignOut={handleSignOut} />
      </aside>

      <header className={styles.topbar}>
        <IconButton
          icon={Menu}
          label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        />
        <Link to="/" className={styles.topbarBrand} aria-label="StudyVault dashboard">
          <Logo size={28} />
        </Link>
      </header>

      <Dialog
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="sheet"
        title="Navigation"
        hideTitle
      >
        <div className={styles.drawer}>
          <Logo size={30} className={styles.drawerLogo} />
          <NavList onNavigate={() => setDrawerOpen(false)} />
          <AccountBlock email={user?.email} onSignOut={handleSignOut} />
        </div>
      </Dialog>

      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        {/* Uploads live here so they continue while moving between screens */}
        <UploadProvider>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </UploadProvider>
      </main>
    </div>
  );
}

export default AppShell;
