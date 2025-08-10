import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import PhoneInput from 'react-phone-number-input';
import { parsePhoneNumber } from 'libphonenumber-js';
import '../Designs/InitialRegister.css'; // our vanilla CSS file

const apiUrl = import.meta.env.VITE_API_URL;

function InitialRegister() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = location.state || {};

  const [hospitals, setHospitals] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    hospital: ''
  });

  const [passwordStrength, setPasswordStrength] = useState('');
  const [isFormValid, setIsFormValid] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Fetch hospital list if needed
  useEffect(() => {
    if (role && role !== 'admin') {
      axios.get(`${apiUrl}/admin/hospitals`)
        .then(res => setHospitals(res.data))
        .catch(err => console.error(err));
    }
  }, [role]);

  // Password strength checker
  useEffect(() => {
    const { password } = formData;
    if (!password) {
      setPasswordStrength('');
      return;
    }
    const strength = checkPasswordStrength(password);
    setPasswordStrength(strength);
  }, [formData.password]);

  // Form validation including phone number
  useEffect(() => {
    const allFilled = Object.entries(formData).every(([key, val]) => {
      if (role === 'admin' && key === 'hospital') return true;
      return val !== undefined && val !== null && val.toString().trim() !== '';
    });
    const passwordsMatch = formData.password === formData.confirmPassword;
    let phoneIsValid = false;
    if (formData.phone) {
      try {
        const phoneNumber = parsePhoneNumber(formData.phone);
        phoneIsValid = phoneNumber.isValid();
      } catch (error) {
        phoneIsValid = false;
      }
    }
    setIsFormValid(allFilled && passwordsMatch && phoneIsValid);
  }, [formData, role]);

  const checkPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    switch (strength) {
      case 0:
      case 1:
        return 'Weak';
      case 2:
        return 'Medium';
      case 3:
      case 4:
        return 'Strong';
      default:
        return '';
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhoneChange = (value) => {
    setFormData({ ...formData, phone: value || '' });
  };

  const handlePhoneBlur = () => {
    if (formData.phone) {
      try {
        const phoneNumber = parsePhoneNumber(formData.phone);
        if (!phoneNumber.isValid()) {
          setPhoneError('Invalid phone number');
        } else {
          setPhoneError('');
        }
      } catch (error) {
        setPhoneError('Invalid phone number');
      }
    } else {
      setPhoneError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    navigate('/complete-registration', { state: { role, step1Data: formData } });
  };

  if (!role) {
    return (
      <div className="page-container">
        <div className="card">
          <p className="error-text">Role not selected. Please go back and select a role.</p>
          <Link to="/register/role" className="link">Go back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="card">
        <h2 className="title">Register - Step 1</h2>
        <p className="role-text">Role: {role}</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Username"
              required
            />
          </div>

          <div className="form-group">
            <div className="input-group">
              <input
                type={showPasswords ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
                required
              />
            </div>
            {passwordStrength && (
              <div className={`password-strength ${passwordStrength.toLowerCase()}`}>
                Strength: {passwordStrength}
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="input-group">
              <input
                type={showPasswords ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="btn-outline"
              >
                {showPasswords ? "Hide" : "Show"}
              </button>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <div className="error-text">Passwords do not match</div>
            )}
          </div>

          <div className="form-group">
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Name"
              required
            />
          </div>

          <div className="form-group">
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email"
              required
            />
          </div>

          <div className="form-group">
            <PhoneInput
              name="phone"
              value={formData.phone}
              onChange={handlePhoneChange}
              onBlur={handlePhoneBlur}
              placeholder="Enter phone number"
              defaultCountry="US"
              international
              countryCallingCodeEditable={false}
              className="phone-input"
              required
              // Note: If you see an "Invalid hook call" error, it’s likely due to multiple React instances.
              // Fix by ensuring 'react' and 'react-dom' versions match and your bundler deduplicates React.
              // Temporary workaround: Uncomment below to disable country select (loses country code feature).
              // withCountrySelect={false}
            />
            {phoneError && <div className="error-text">{phoneError}</div>}
          </div>

          <div className="form-group">
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Address"
              required
            />
          </div>

          {role !== 'admin' && (
            <div className="form-group">
              <select
                name="hospital"
                value={formData.hospital}
                onChange={handleChange}
                required
              >
                <option value="">Select Hospital</option>
                {hospitals.map(h => (
                  <option key={h._id} value={h._id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="custom-action-btn"
            disabled={!isFormValid}
          >
            Next
          </button>
        </form>
      </div>
    </div>
  );
}

export default InitialRegister;