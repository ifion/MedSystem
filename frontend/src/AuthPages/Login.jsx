import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../Designs/Login.css'; // New stylesheet

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const apiUrl = import.meta.env.VITE_API_URL;

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
        const { token, role, userId } = data;
        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        localStorage.setItem('doctorId', userId);
        alert('Login successful!');

        if (role === 'admin') navigate('/admindashboard');
        else if (role === 'doctor') navigate('/doctor/dashboard');
        else if (role === 'patient') navigate('/patient/dashboard');
        else navigate('/dashboard');
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
          {/* Username */}
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Password with toggle */}
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

          {/* Submit */}
          <button type="submit" className="btn-primary1">Login</button>
        </form>

        <p className="login-footer">
          Don&apos;t have an account?{' '}
          <Link to="/roleselect" className="link-primary">Register</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
