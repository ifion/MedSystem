import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import '../Designs/CompleteRegister.css'; // Import our vanilla CSS

function CompleteRegister() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, step1Data } = location.state || {};
  const apiUrl = import.meta.env.VITE_API_URL;

  const [step2Data, setStep2Data] = useState(
    role === 'doctor'
      ? { specialization: '', licenseNumber: '', yearsOfExperience: '', identityCard: null, profilePicture: null }
      : { dateOfBirth: '', gender: '', profilePicture: null }
  );

  const handleChange = (e) => {
    setStep2Data({ ...step2Data, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setStep2Data({ ...step2Data, [e.target.name]: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    for (const key in step1Data) {
      formData.append(key, step1Data[key]);
    }
    formData.append('role', role);

    if (role === 'doctor') {
      formData.append('specialization', step2Data.specialization);
      formData.append('licenseNumber', step2Data.licenseNumber);
      formData.append('yearsOfExperience', step2Data.yearsOfExperience);
      if (step2Data.identityCard) formData.append('identityCard', step2Data.identityCard);
      if (step2Data.profilePicture) formData.append('profilePicture', step2Data.profilePicture);
    } else if (role === 'patient') {
      formData.append('dateOfBirth', step2Data.dateOfBirth);
      formData.append('gender', step2Data.gender);
      if (step2Data.profilePicture) formData.append('profilePicture', step2Data.profilePicture);
    }

    try {
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        navigate('/login');
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error during registration:', error);
      alert('An error occurred during registration.');
    }
  };

  if (!role || !step1Data) {
    return (
      <div className="page-wrapper">
        <div className="card">
          <p className="text-error">Invalid access. Please start from role selection.</p>
          <Link to="/register/role" className="link-primary">Go back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="card">
        <h2 className="form-title">Register - Step 2 ({role})</h2>
        <form onSubmit={handleSubmit}>
          {role === 'doctor' && (
            <>
              <div className="form-group">
                <label>Specialization:</label>
                <input
                  type="text"
                  name="specialization"
                  value={step2Data.specialization}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>License Number:</label>
                <input
                  type="text"
                  name="licenseNumber"
                  value={step2Data.licenseNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Years of Experience:</label>
                <input
                  type="number"
                  name="yearsOfExperience"
                  value={step2Data.yearsOfExperience}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Identity Card:</label>
                <input
                  type="file"
                  name="identityCard"
                  onChange={handleFileChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Profile Picture:</label>
                <input
                  type="file"
                  name="profilePicture"
                  onChange={handleFileChange}
                />
              </div>
            </>
          )}

          {role === 'patient' && (
            <>
              <div className="form-group">
                <label>Date of Birth:</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={step2Data.dateOfBirth}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Gender:</label>
                <select
                  name="gender"
                  value={step2Data.gender}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Profile Picture:</label>
                <input
                  type="file"
                  name="profilePicture"
                  onChange={handleFileChange}
                />
              </div>
            </>
          )}

          <button type="submit" className="btn-primary2">Register</button>
        </form>
      </div>
    </div>
  );
}

export default CompleteRegister;
