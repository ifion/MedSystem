// First, create a new file: src/components/Header.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../Designs/Header.css'; // We'll create this CSS file below

function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
  }, []);

  const handleLogout = () => {
    // Clear local storage for stored IDs, token, role, etc.
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    // Optionally clear more if needed, or use localStorage.clear() for everything
    setIsLoggedIn(false);
    navigate('/'); // Redirect to landing page
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          MedSystem
        </Link>
        <div className="auth-buttons">
          {isLoggedIn ? (
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          ) : (
            <>
              <Link to="/roleselect" className="btn-signup">
                Sign Up
              </Link>
              <Link to="/login" className="btn-login">
                Log In
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;