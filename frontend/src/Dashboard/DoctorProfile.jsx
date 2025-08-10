import React, { useState, useEffect } from 'react';
import '../Designs/DoctorProfile.css';

const DoctorProfile = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [specialization, setSpecialization] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [education, setEducation] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [profilePicture, setProfilePicture] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [error, setError] = useState('');

  // Fetch profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token'); // Assuming token is stored after login
        const response = await fetch(`${import.meta.env.VITE_API_URL}/doctor/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        const data = await response.json();
        setProfile(data);
      } catch (err) {
        setError('Error fetching profile');
        console.error(err);
      }
    };
    fetchProfile();
  }, []);

  // Sync form fields with fetched profile
  useEffect(() => {
    if (profile) {
      setSpecialization(profile.specialization || '');
      setYearsOfExperience(profile.yearsOfExperience || '');
      setEducation(profile.education || []);
      setCertifications(profile.certifications || []);
      setProfilePicture(null);
      setPreviewImage(null);
    }
  }, [profile]);

  // Handle education field changes
  const updateEducation = (index, field, value) => {
    const newEducation = [...education];
    newEducation[index][field] = value;
    setEducation(newEducation);
  };

  const addEducation = () => {
    setEducation([...education, { degree: '', institution: '', year: '' }]);
  };

  const removeEducation = (index) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  // Handle certification field changes
  const updateCertification = (index, value) => {
    const newCertifications = [...certifications];
    newCertifications[index] = value;
    setCertifications(newCertifications);
  };

  const addCertification = () => {
    setCertifications([...certifications, '']);
  };

  const removeCertification = (index) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  // Handle profile picture preview
  const handlePictureChange = (e) => {
    const file = e.target.files[0];
    setProfilePicture(file);
    setPreviewImage(file ? URL.createObjectURL(file) : null);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('profile', JSON.stringify({
      specialization,
      yearsOfExperience,
      education,
      certifications,
    }));
    if (profilePicture) {
      formData.append('profilePicture', profilePicture);
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/doctor/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to update profile');
      }
      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      setIsEditing(false);
      setError('');
    } catch (err) {
      setError('Error updating profile');
      console.error(err);
    }
  };

  // View mode rendering
  const renderViewMode = () => (
    <div className="profile-view">
      <h2>Doctor Profile</h2>
      {profile.profilePicture && (
        <img src={profile.profilePicture} alt="Profile" className="profile-pic" />
      )}
      <p><strong>Name:</strong> {profile.doctorId.name}</p>
      <p><strong>Email:</strong> {profile.doctorId.email}</p>
      <p><strong>Phone:</strong> {profile.doctorId.phone || 'N/A'}</p>
      <p><strong>Address:</strong> {profile.doctorId.address || 'N/A'}</p>
      <p><strong>Specialization:</strong> {profile.specialization || 'N/A'}</p>
      <p><strong>License Number:</strong> {profile.licenseNumber || 'N/A'}</p>
      <p><strong>Years of Experience:</strong> {profile.yearsOfExperience || 'N/A'}</p>
      <div>
        <strong>Education:</strong>
        {profile.education && profile.education.length > 0 ? (
          <ul>
            {profile.education.map((edu, index) => (
              <li key={index}>
                {edu.degree} - {edu.institution} ({edu.year})
              </li>
            ))}
          </ul>
        ) : (
          <p>N/A</p>
        )}
      </div>
      <div>
        <strong>Certifications:</strong>
        {profile.certifications && profile.certifications.length > 0 ? (
          <ul>
            {profile.certifications.map((cert, index) => (
              <li key={index}>{cert}</li>
            ))}
          </ul>
        ) : (
          <p>N/A</p>
        )}
      </div>
      <button onClick={() => setIsEditing(true)}>Edit Profile</button>
    </div>
  );

  // Edit mode rendering
  const renderEditMode = () => (
    <div className="profile-edit">
      <h2>Edit Profile</h2>
      <div className="form-group">
        <label>Specialization:</label>
        <input
          type="text"
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Years of Experience:</label>
        <input
          type="number"
          value={yearsOfExperience}
          onChange={(e) => setYearsOfExperience(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Education:</label>
        {education.map((edu, index) => (
          <div key={index} className="education-entry">
            <input
              type="text"
              placeholder="Degree"
              value={edu.degree}
              onChange={(e) => updateEducation(index, 'degree', e.target.value)}
            />
            <input
              type="text"
              placeholder="Institution"
              value={edu.institution}
              onChange={(e) => updateEducation(index, 'institution', e.target.value)}
            />
            <input
              type="number"
              placeholder="Year"
              value={edu.year}
              onChange={(e) => updateEducation(index, 'year', e.target.value)}
            />
            <button type="button" onClick={() => removeEducation(index)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addEducation}>Add Education</button>
      </div>
      <div className="form-group">
        <label>Certifications:</label>
        {certifications.map((cert, index) => (
          <div key={index} className="certification-entry">
            <input
              type="text"
              value={cert}
              onChange={(e) => updateCertification(index, e.target.value)}
            />
            <button type="button" onClick={() => removeCertification(index)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addCertification}>Add Certification</button>
      </div>
      <div className="form-group">
        <label>Profile Picture:</label>
        {previewImage ? (
          <img src={previewImage} alt="Preview" className="profile-pic-preview" />
        ) : profile.profilePicture ? (
          <img src={profile.profilePicture} alt="Current" className="profile-pic-preview" />
        ) : null}
        <input type="file" onChange={handlePictureChange} />
      </div>
      <button onClick={handleSubmit}>Save</button>
      <button type="button" onClick={() => setIsEditing(false)}>Cancel</button>
      {error && <p className="error">{error}</p>}
    </div>
  );

  return (
    <div className="doctor-profile">
      {error && !profile && <p className="error">{error}</p>}
      {profile ? (isEditing ? renderEditMode() : renderViewMode()) : <p>Loading...</p>}
    </div>
  );
};

export default DoctorProfile;