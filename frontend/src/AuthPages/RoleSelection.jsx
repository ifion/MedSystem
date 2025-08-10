import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../Designs/RoleSelection.css'; // New stylesheet

function RoleSelection() {
  const navigate = useNavigate();

  const handleSelectRole = (role) => {
    navigate('/register', { state: { role } });
  };

  return (
    <div className="role-container">
      <div className="role-card">
        <h2 className="role-title">Select Your Role</h2>
        <div className="role-buttons">
          <button onClick={() => handleSelectRole('doctor')} className="btn-primary">
            Doctor
          </button>
          <button onClick={() => handleSelectRole('patient')} className="btn-primary">
            Patient
          </button>
        </div>
        <p className="role-footer">
          Already have an account?{' '}
          <Link to="/" className="link-primary">Login</Link>
        </p>
      </div>
    </div>
  );
}

export default RoleSelection;
