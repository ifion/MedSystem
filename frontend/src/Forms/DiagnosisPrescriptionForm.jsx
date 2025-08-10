// Modified src/components/DiagnosisPrescriptionForm.js (full code with additions)
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../Designs/DiagnosisPrescriptionForm.css'; 

const DiagnosisPrescriptionForm = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const apiUrl = import.meta.env.VITE_API_URL;
  const token = localStorage.getItem('token');

  const [diagnosis, setDiagnosis] = useState({
    condition: '',
    description: '',
    treatment: ''
  });

  const [prescription, setPrescription] = useState({
    medication: '',
    dosage: '',
    duration: '',
    instructions: ''
  });

  const [testSuggestion, setTestSuggestion] = useState({
    testType: '',
    notes: ''
  });

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // New state to track which section is saved
  const [diagnosisSaved, setDiagnosisSaved] = useState(false);
  const [prescriptionSaved, setPrescriptionSaved] = useState(false);
  const [testSaved, setTestSaved] = useState(false);

  const handleDiagnosisChange = (e) => {
    setDiagnosis({ ...diagnosis, [e.target.name]: e.target.value });
    // Reset success indicators if user starts editing again
    setDiagnosisSaved(false);
    setSuccess(null);
  };

  const handlePrescriptionChange = (e) => {
    setPrescription({ ...prescription, [e.target.name]: e.target.value });
    // Reset success indicators if user starts editing again
    setPrescriptionSaved(false);
    setSuccess(null);
  };

  const handleTestChange = (e) => {
    setTestSuggestion({ ...testSuggestion, [e.target.name]: e.target.value });
    setTestSaved(false);
    setSuccess(null);
  };

  const submitDiagnosis = async () => {
    try {
      await axios.post(`${apiUrl}/diagnosis`, { patientId, ...diagnosis }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSuccess('Diagnosis saved successfully!');
      setDiagnosisSaved(true); // Set the visual confirmation
      setError(null);
    } catch (err) {
      setError('Failed to save diagnosis.');
      setSuccess(null);
      setDiagnosisSaved(false);
      console.error(err);
    }
  };

  const submitPrescription = async () => {
    try {
      await axios.post(`${apiUrl}/prescriptions`, { patientId, ...prescription }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSuccess('Prescription saved successfully!');
      setPrescriptionSaved(true); // Set the visual confirmation
      setError(null);
    } catch (err) {
      setError('Failed to save prescription.');
      setSuccess(null);
      setPrescriptionSaved(false);
      console.error(err);
    }
  };

  const submitTestSuggestion = async () => {
    try {
      await axios.post(`${apiUrl}/test-results/suggest`, { patientId, ...testSuggestion }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSuccess('Test suggested successfully!');
      setTestSaved(true);
      setError(null);
    } catch (err) {
      setError('Failed to suggest test.');
      setSuccess(null);
      setTestSaved(false);
      console.error(err);
    }
  };

  return (
    <div className="dp-container">
      <header className="dp-header">
        <h2 className="dp-title">Patient Records</h2>
        <button onClick={() => navigate(-1)} className="dp-back-button">← Back to Chat</button>
      </header>
      
      <p className="dp-patient-id">Managing records for Patient ID: <strong>{patientId}</strong></p>

      {error && <div className="dp-alert dp-alert-error">{error}</div>}
      {success && <div className="dp-alert dp-alert-success">{success}</div>}

      <div className="dp-form-wrapper">
        {/* Diagnosis section */}
        <section className={`dp-section ${diagnosisSaved ? 'dp-section-success' : ''}`}>
          <h3 className="dp-section-title">
            <span>🩺 Diagnosis</span>
            {diagnosisSaved && <span className="dp-checkmark">✓</span>}
          </h3>
          <div className="dp-form-group">
            <label htmlFor="condition" className="dp-label">Condition</label>
            <input id="condition" name="condition" placeholder="e.g., Hypertension" value={diagnosis.condition} onChange={handleDiagnosisChange} className="dp-input" />
          </div>
          <div className="dp-form-group">
            <label htmlFor="description" className="dp-label">Description</label>
            <textarea id="description" name="description" placeholder="Clinical findings and observations..." value={diagnosis.description} onChange={handleDiagnosisChange} className="dp-input" />
          </div>
          <div className="dp-form-group">
            <label htmlFor="treatment" className="dp-label">Treatment Plan</label>
            <textarea id="treatment" name="treatment" placeholder="Recommended lifestyle changes, procedures, etc." value={diagnosis.treatment} onChange={handleDiagnosisChange} className="dp-input" />
          </div>
          <button onClick={submitDiagnosis} className="dp-submit-button">Save Diagnosis</button>
        </section>

        {/* Prescription section */}
        <section className={`dp-section ${prescriptionSaved ? 'dp-section-success' : ''}`}>
          <h3 className="dp-section-title">
            <span>℞ Prescription</span>
            {prescriptionSaved && <span className="dp-checkmark">✓</span>}
          </h3>
          <div className="dp-form-group">
            <label htmlFor="medication" className="dp-label">Medication</label>
            <input id="medication" name="medication" placeholder="e.g., Lisinopril" value={prescription.medication} onChange={handlePrescriptionChange} className="dp-input" />
          </div>
          <div className="dp-grid">
            <div className="dp-form-group">
              <label htmlFor="dosage" className="dp-label">Dosage</label>
              <input id="dosage" name="dosage" placeholder="e.g., 10mg" value={prescription.dosage} onChange={handlePrescriptionChange} className="dp-input" />
            </div>
            <div className="dp-form-group">
              <label htmlFor="duration" className="dp-label">Duration</label>
              <input id="duration" name="duration" placeholder="e.g., 30 days" value={prescription.duration} onChange={handlePrescriptionChange} className="dp-input" />
            </div>
          </div>
          <div className="dp-form-group">
            <label htmlFor="instructions" className="dp-label">Instructions</label>
            <textarea id="instructions" name="instructions" placeholder="e.g., Take one tablet daily in the morning" value={prescription.instructions} onChange={handlePrescriptionChange} className="dp-input" />
          </div>
          <button onClick={submitPrescription} className="dp-submit-button">Save Prescription</button>
        </section>

        {/* New Test Suggestion section */}
        <section className={`dp-section ${testSaved ? 'dp-section-success' : ''}`}>
          <h3 className="dp-section-title">
            <span>🧪 Test Suggestion</span>
            {testSaved && <span className="dp-checkmark">✓</span>}
          </h3>
          <div className="dp-form-group">
            <label htmlFor="testType" className="dp-label">Test Type</label>
            <input id="testType" name="testType" placeholder="e.g., Blood Test" value={testSuggestion.testType} onChange={handleTestChange} className="dp-input" />
          </div>
          <div className="dp-form-group">
            <label htmlFor="notes" className="dp-label">Notes</label>
            <textarea id="notes" name="notes" placeholder="Additional suggestions or reasons..." value={testSuggestion.notes} onChange={handleTestChange} className="dp-input" />
          </div>
          <button onClick={submitTestSuggestion} className="dp-submit-button">Suggest Test</button>
        </section>
      </div>
    </div>
  );
};

export default DiagnosisPrescriptionForm;