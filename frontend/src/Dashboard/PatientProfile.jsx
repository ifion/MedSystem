import React, { useState, useEffect } from 'react';
import '../Designs/PatientProfile.css';

const PatientProfile = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [error, setError] = useState('');

  // Fetch profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${import.meta.env.VITE_API_URL}/patient/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          setFormData(data);
        } else if (response.status === 404) {
          setProfile(null);
          setIsEditing(true);
          setFormData({
            dateOfBirth: '',
            gender: '',
            bloodType: '',
            allergies: [],
            medicalHistory: [],
            currentMedications: [],
            insuranceInfo: { provider: '', policyNumber: '' },
            emergencyContact: { name: '', relation: '', phone: '' },
            profilePicture: '',
          });
        } else {
          throw new Error('Failed to fetch profile');
        }
      } catch (err) {
        setError('Error fetching profile');
        console.error(err);
      }
    };
    fetchProfile();
  }, []);

  // Handle form changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle nested changes (e.g., insuranceInfo, emergencyContact)
  const handleNestedChange = (field, subField, value) => {
    setFormData({
      ...formData,
      [field]: { ...formData[field], [subField]: value },
    });
  };

  // Handle array changes (e.g., allergies, currentMedications)
  const handleArrayChange = (field, index, value) => {
    const newArray = [...formData[field]];
    newArray[index] = value;
    setFormData({ ...formData, [field]: newArray });
  };

  // Add item to array
  const addToArray = (field) => {
    setFormData({ ...formData, [field]: [...formData[field], ''] });
  };

  // Remove item from array
  const removeFromArray = (field, index) => {
    setFormData({ ...formData, [field]: formData[field].filter((_, i) => i !== index) });
  };

  // Handle medical history changes
  const handleMedicalHistoryChange = (index, subField, value) => {
    const newHistory = [...formData.medicalHistory];
    newHistory[index][subField] = value;
    setFormData({ ...formData, medicalHistory: newHistory });
  };

  // Add medical history entry
  const addMedicalHistory = () => {
    setFormData({
      ...formData,
      medicalHistory: [...formData.medicalHistory, { condition: '', date: '', notes: '' }],
    });
  };

  // Remove medical history entry
  const removeMedicalHistory = (index) => {
    setFormData({
      ...formData,
      medicalHistory: formData.medicalHistory.filter((_, i) => i !== index),
    });
  };

  // Handle profile picture change
  const handlePictureChange = (e) => {
    const file = e.target.files[0];
    setProfilePictureFile(file);
    setPreviewImage(file ? URL.createObjectURL(file) : null);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('profile', JSON.stringify(formData));
    if (profilePictureFile) {
      data.append('profilePicture', profilePictureFile);
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/patient/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data,
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

  // Render view mode
  const renderViewMode = () => (
    <div className="profile-view">
      <h2>Patient Profile</h2>
      {profile.profilePicture && (
        <img src={profile.profilePicture} alt="Profile" className="profile-pic" />
      )}
      <p><strong>Name:</strong> {profile.patientId.name}</p>
      <p><strong>Email:</strong> {profile.patientId.email}</p>
      <p><strong>Phone:</strong> {profile.patientId.phone || 'N/A'}</p>
      <p><strong>Address:</strong> {profile.patientId.address || 'N/A'}</p>
      <p><strong>Date of Birth:</strong> {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
      <p><strong>Gender:</strong> {profile.gender || 'N/A'}</p>
      <p><strong>Blood Type:</strong> {profile.bloodType || 'N/A'}</p>
      <div>
        <strong>Allergies:</strong>
        {profile.allergies && profile.allergies.length > 0 ? (
          <ul>
            {profile.allergies.map((allergy, index) => (
              <li key={index}>{allergy}</li>
            ))}
          </ul>
        ) : (
          <p>N/A</p>
        )}
      </div>
      <div>
        <strong>Medical History:</strong>
        {profile.medicalHistory && profile.medicalHistory.length > 0 ? (
          <ul>
            {profile.medicalHistory.map((history, index) => (
              <li key={index}>
                {history.condition} - {new Date(history.date).toLocaleDateString()} - {history.notes}
              </li>
            ))}
          </ul>
        ) : (
          <p>N/A</p>
        )}
      </div>
      <div>
        <strong>Current Medications:</strong>
        {profile.currentMedications && profile.currentMedications.length > 0 ? (
          <ul>
            {profile.currentMedications.map((med, index) => (
              <li key={index}>{med}</li>
            ))}
          </ul>
        ) : (
          <p>N/A</p>
        )}
      </div>
      <p><strong>Insurance Provider:</strong> {profile.insuranceInfo?.provider || 'N/A'}</p>
      <p><strong>Policy Number:</strong> {profile.insuranceInfo?.policyNumber || 'N/A'}</p>
      <p><strong>Emergency Contact:</strong> {profile.emergencyContact?.name || 'N/A'} ({profile.emergencyContact?.relation || 'N/A'}) - {profile.emergencyContact?.phone || 'N/A'}</p>
      <button onClick={() => setIsEditing(true)}>Edit Profile</button>
    </div>
  );

  // Render edit mode
  const renderEditMode = () => (
    <form onSubmit={handleSubmit} className="profile-edit">
      <h2>Edit Profile</h2>
      <div className="form-group">
        <label>Date of Birth:</label>
        <input
          type="date"
          name="dateOfBirth"
          value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString().split('T')[0] : ''}
          onChange={handleChange}
        />
      </div>
      <div className="form-group">
        <label>Gender:</label>
        <select name="gender" value={formData.gender || ''} onChange={handleChange}>
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="form-group">
        <label>Blood Type:</label>
        <select name="bloodType" value={formData.bloodType || ''} onChange={handleChange}>
          <option value="">Select</option>
          <option value="A+">A+</option>
          <option value="A-">A-</option>
          <option value="B+">B+</option>
          <option value="B-">B-</option>
          <option value="AB+">AB+</option>
          <option value="AB-">AB-</option>
          <option value="O+">O+</option>
          <option value="O-">O-</option>
        </select>
      </div>
      <div className="form-group">
        <label>Allergies:</label>
        {formData.allergies.map((allergy, index) => (
          <div key={index}>
            <input
              type="text"
              value={allergy}
              onChange={(e) => handleArrayChange('allergies', index, e.target.value)}
            />
            <button type="button" onClick={() => removeFromArray('allergies', index)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => addToArray('allergies')}>Add Allergy</button>
      </div>
      <div className="form-group">
        <label>Medical History:</label>
        {formData.medicalHistory.map((history, index) => (
          <div key={index}>
            <input
              type="text"
              placeholder="Condition"
              value={history.condition}
              onChange={(e) => handleMedicalHistoryChange(index, 'condition', e.target.value)}
            />
            <input
              type="date"
              value={history.date ? new Date(history.date).toISOString().split('T')[0] : ''}
              onChange={(e) => handleMedicalHistoryChange(index, 'date', e.target.value)}
            />
            <input
              type="text"
              placeholder="Notes"
              value={history.notes}
              onChange={(e) => handleMedicalHistoryChange(index, 'notes', e.target.value)}
            />
            <button type="button" onClick={() => removeMedicalHistory(index)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addMedicalHistory}>Add Medical History</button>
      </div>
      <div className="form-group">
        <label>Current Medications:</label>
        {formData.currentMedications.map((med, index) => (
          <div key={index}>
            <input
              type="text"
              value={med}
              onChange={(e) => handleArrayChange('currentMedications', index, e.target.value)}
            />
            <button type="button" onClick={() => removeFromArray('currentMedications', index)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => addToArray('currentMedications')}>Add Medication</button>
      </div>
      <div className="form-group">
        <label>Insurance Provider:</label>
        <input
          type="text"
          value={formData.insuranceInfo?.provider || ''}
          onChange={(e) => handleNestedChange('insuranceInfo', 'provider', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Policy Number:</label>
        <input
          type="text"
          value={formData.insuranceInfo?.policyNumber || ''}
          onChange={(e) => handleNestedChange('insuranceInfo', 'policyNumber', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Emergency Contact Name:</label>
        <input
          type="text"
          value={formData.emergencyContact?.name || ''}
          onChange={(e) => handleNestedChange('emergencyContact', 'name', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Relation:</label>
        <input
          type="text"
          value={formData.emergencyContact?.relation || ''}
          onChange={(e) => handleNestedChange('emergencyContact', 'relation', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Phone:</label>
        <input
          type="text"
          value={formData.emergencyContact?.phone || ''}
          onChange={(e) => handleNestedChange('emergencyContact', 'phone', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Profile Picture:</label>
        {previewImage ? (
          <img src={previewImage} alt="Preview" className="profile-pic-preview" />
        ) : formData.profilePicture ? (
          <img src={formData.profilePicture} alt="Current" className="profile-pic-preview" />
        ) : null}
        <input type="file" onChange={handlePictureChange} />
      </div>
      <button type="submit">Save</button>
      <button type="button" onClick={() => setIsEditing(false)}>Cancel</button>
      {error && <p className="error">{error}</p>}
    </form>
  );

  return (
    <div className="patient-profile">
      {error && !profile && <p className="error">{error}</p>}
      {profile ? (isEditing ? renderEditMode() : renderViewMode()) : isEditing ? renderEditMode() : <p>Loading...</p>}
    </div>
  );
};

export default PatientProfile;