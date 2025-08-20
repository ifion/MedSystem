import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../Designs/Header.css';

function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUserName = localStorage.getItem('username');
    setIsLoggedIn(!!token);
    setUserName(storedUserName || '');

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setShowDropdown(false);
    navigate('/');
  };

  return (
    <header className={`header ${isScrolled ? 'scrolled' : ''}`}>
      <div className="header-container">
        <Link to="/" className="logo">
          <span className="logo-icon">⚕️</span>
          <span className="logo-text">MedSystem</span>
        </Link>
        
        <nav className="nav-links">
          <Link to="/#features">Features</Link>
          <Link to="/#about">About</Link>
          <Link to="/#services">Services</Link>
          <Link to="/#contact">Contact</Link>
        </nav>

        <div className="auth-buttons">
          {isLoggedIn ? (
            <div className="user-menu">
              <button 
                className="user-profile"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <span className="user-avatar">
                  {userName.charAt(0).toUpperCase()}
                </span>
                <span className="user-name">{userName}</span>
                <span className="dropdown-arrow">▼</span>
              </button>
              
              {showDropdown && (
                <div className="dropdown-menu">
                  <Link to="/dashboard">Dashboard</Link>
                  <Link to="/profile">Profile</Link>
                  <Link to="/settings">Settings</Link>
                  <button onClick={handleLogout} className="btn-logout">
                    <span className="logout-icon">🚪</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-buttons-container">
              <Link to="/roleselect" className="btn-signup">
                <span className="signup-icon">👋</span>
                Sign Up
              </Link>
              <Link to="/login" className="btn-login">
                <span className="login-icon">🔐</span>
                Log In
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;