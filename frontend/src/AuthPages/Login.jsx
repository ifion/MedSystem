// src/pages/Login.jsx  (or wherever your Login component lives)
import React, { useState, useEffect } from 'react';        // <-- added useEffect
import { useNavigate, Link } from 'react-router-dom';
import '../Designs/Login.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const apiUrl = import.meta.env.VITE_API_URL;

  /* 1️⃣  Clear any stale userId when the component mounts */
  useEffect(() => {
    localStorage.removeItem('userId');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        const { token, role, userId } = data;   // userId is returned by /login
        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        localStorage.setItem('userId', userId); // 2️⃣  Store the real user id

        alert('Login successful!');
        switch (role) {
          case 'admin':
            navigate('/admindashboard');
            break;
          case 'doctor':
            navigate('/doctor/dashboard');
            break;
          case 'patient':
            navigate('/patient/dashboard');
            break;
          default:
            navigate('/dashboard');
        }
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">Login</h2>
        {error && <p className="error-message">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password:</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary1">
            Login
          </button>
        </form>

        <p className="login-footer">
          Don&apos;t have an account?{' '}
          <Link to="/roleselect" className="link-primary">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;