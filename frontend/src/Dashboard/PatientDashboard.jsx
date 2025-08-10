// Updated PatientDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../Designs/PatientDashboard.css';

const apiUrl = import.meta.env.VITE_API_URL;

const isToday = (date) => {
  const today = new Date();
  const appointmentDate = new Date(date);
  return today.toDateString() === appointmentDate.toDateString();
};

const PatientDashboard = () => {
  const [notes, setNotes] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [testResultsRes, diagnosesRes, prescriptionsRes, appointmentsRes] = await Promise.all([
          axios.get(`${apiUrl}/test-results/my`, { headers }),
          axios.get(`${apiUrl}/patient/diagnoses`, { headers }),
          axios.get(`${apiUrl}/patient/prescriptions`, { headers }),
          axios.get(`${apiUrl}/patient/appointments`, { headers }),
        ]);
        setTestResults(testResultsRes.data);
        setDiagnoses(diagnosesRes.data);
        setPrescriptions(prescriptionsRes.data);
        setAppointments(appointmentsRes.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleRequestAppointment = async () => {
    if (!notes.trim()) {
      alert('Please provide a reason for the appointment.');
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${apiUrl}/patient/appointments/request`, { notes }, { headers });
      alert('Appointment request submitted successfully!');
      setNotes('');
    } catch (error) {
      console.error('Error requesting appointment:', error);
      alert('Failed to submit appointment request.');
    }
  };

  const handleCompleteAppointment = async (id) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${apiUrl}/patient/appointments/${id}/complete`, {}, { headers });
      setAppointments(prev => prev.map(app => app._id === id ? { ...app, patientCompleted: true } : app));
    } catch (error) {
      console.error('Error completing appointment:', error);
      alert('Failed to mark appointment as completed');
    }
  };

  const handleFileChange = (testId, file) => {
    setSelectedFiles(prev => ({ ...prev, [testId]: file }));
  };

  const handleUploadResult = async (testId) => {
    const file = selectedFiles[testId];
    if (!file) {
      alert('Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('result', file);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      };
      const response = await axios.post(`${apiUrl}/test-results/upload/${testId}`, formData, { headers });
      setTestResults(prev => prev.map(test => test._id === testId ? response.data : test));
      setSelectedFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[testId];
        return newFiles;
      });
      alert('Test result uploaded successfully!');
    } catch (error) {
      console.error('Error uploading test result:', error);
      alert('Failed to upload test result.');
    }
  };

  return (
    <div className="patient-dashboard">
      <h1>Patient Dashboard</h1>
      <button
        onClick={() => navigate('/patient/profile')}
        style={{
          backgroundColor: '#4CAF50',
          color: 'white',
          padding: '10px 20px',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          marginBottom: '20px',
        }}
      >
        View Profile
      </button>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <section className="appointments">
            <h2>My Appointments</h2>
            {appointments.length === 0 ? (
              <p>No appointments available.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Doctor</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Date & Time</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Status</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Notes</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((app) => (
                    <tr key={app._id}>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.doctorId ? app.doctorId.name : 'Not Assigned'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                        {app.dateTime ? new Date(app.dateTime).toLocaleString() : 'Not Set'}
                      </td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.status}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.notes || 'N/A'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                        {app.status === 'confirmed' && (
                          <>
                            <button
                              onClick={() => handleCompleteAppointment(app._id)}
                              style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '5px 10px', marginRight: '5px' }}
                              disabled={!app.dateTime || new Date() < new Date(app.dateTime)}
                            >
                              Mark as Completed
                            </button>
                            {app.doctorId && isToday(app.dateTime) && (
                              <button
                                onClick={() => navigate(`/chat/${app.doctorId._id}`)}
                                style={{ background: '#1976d2', color: 'white', border: 'none', padding: '5px 10px' }}
                              >
                                Chat
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="appointment-request">
            <h2>Request an Appointment</h2>
            <div className="form-group">
              <label htmlFor="notes">Reason for Appointment:</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for appointment..."
              />
            </div>
            <button onClick={handleRequestAppointment} className="submit-btn">
              Submit Request
            </button>
          </section>

          <section className="medical-records">
            <h2>Test Results</h2>
            {testResults.length === 0 ? (
              <p>No test results available.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Test Type</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Date</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Results</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Notes</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((result) => (
                    <tr key={result._id}>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{result.testType}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(result.date).toLocaleDateString()}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                        {result.results ? <a href={result.results} target="_blank" rel="noopener noreferrer">View Result</a> : 'Pending'}
                      </td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{result.notes || 'N/A'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                        {!result.results && (
                          <>
                            <input
                              type="file"
                              onChange={(e) => handleFileChange(result._id, e.target.files[0])}
                              style={{ marginRight: '10px' }}
                            />
                            <button
                              onClick={() => handleUploadResult(result._id)}
                              disabled={!selectedFiles[result._id]}
                              style={{ background: '#1ABC9C', color: 'white', border: 'none', padding: '5px 10px' }}
                            >
                              Upload
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Diagnoses</h2>
            {diagnoses.length === 0 ? (
              <p>No diagnoses available.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Condition</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Date</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Description</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Treatment</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnoses.map((diagnosis) => (
                    <tr key={diagnosis._id}>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{diagnosis.condition}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(diagnosis.date).toLocaleDateString()}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{diagnosis.description || 'N/A'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{diagnosis.treatment || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Prescriptions</h2>
            {prescriptions.length === 0 ? (
              <p>No prescriptions available.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Medication</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Date</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Dosage</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Duration</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Instructions</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((prescription) => (
                    <tr key={prescription._id}>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{prescription.medication}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(prescription.date).toLocaleDateString()}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{prescription.dosage || 'N/A'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{prescription.duration || 'N/A'}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{prescription.instructions || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default PatientDashboard;