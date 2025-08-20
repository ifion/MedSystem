import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import '../Designs/Header.css';

function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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
    navigate('/');
  };

  // Check page conditions
  const isLandingPage = location.pathname === '/';
  const isHiddenPage =
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/video-call');

  if (isHiddenPage) return null; // Hide header on chat & video-call pages

  return (
    <header className={`header ${isScrolled ? 'scrolled' : ''}`}>
      <div className="header-container">
        {/* Logo */}
        <Link to="/" className="logo">
          <span className="logo-icon">⚕️</span>
          <span className="logo-text">MedSystem</span>
        </Link>

        {/* Show nav links only on Landing */}
        {isLandingPage && (
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#contact">Contact</a>
          </nav>
        )}

        {/* Auth buttons */}
        <div className="auth-buttons">
          {isLoggedIn ? (
            <button onClick={handleLogout} className="btn-logout">
              <span className="logout-icon">🚪</span>
              Logout
            </button>
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
