import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <div>
        <Link to="/" style={{ textDecoration: 'none', fontSize: '1.25rem', fontWeight: 'bold' }}>StudyVault</Link>
      </div>
      <div>
        {user ? (
          <>
            <Link to="/flashcards" style={{ marginRight: '1rem' }}>📚 My Flashcards</Link>
            <span style={{ marginRight: '1rem' }}>{user.email}</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ marginRight: '1rem' }}>Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
