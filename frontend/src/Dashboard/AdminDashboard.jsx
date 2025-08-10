import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../Designs/AdminDashboard.css';

const apiUrl = import.meta.env.VITE_API_URL;

const sections = [
  { key: 'pending', label: 'Pending Users' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointmentRequests', label: 'Appointment Requests' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'diagnoses', label: 'Diagnoses' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'testResults', label: 'Test Results' },
];

const PendingUsersTable = ({ pendingUsers, handleVerification }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {pendingUsers.map(user => (
        <tr key={user._id}>
          <td>{user.name}</td>
          <td>{user.email}</td>
          <td>{user.role}</td>
          <td>
            <button onClick={() => handleVerification(user._id, 'active')} className="approve-button">
              Approve
            </button>
            <button onClick={() => handleVerification(user._id, 'rejected')} className="reject-button">
              Reject
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const DoctorsTable = ({ doctors, onViewProfile }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Address</th>
        <th>Specialization</th>
        <th>License Number</th>
      </tr>
    </thead>
    <tbody>
      {doctors.map(doc => (
        <tr key={doc.user._id} onClick={() => onViewProfile(doc.user._id)} style={{ cursor: 'pointer' }}>
          <td>{doc.user.name}</td>
          <td>{doc.user.email}</td>
          <td>{doc.user.phone || 'N/A'}</td>
          <td>{doc.user.address || 'N/A'}</td>
          <td>{doc.profile.specialization || 'N/A'}</td>
          <td>{doc.profile.licenseNumber || 'N/A'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const PatientsTable = ({ patients, onViewProfile }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Address</th>
        <th>Date of Birth</th>
        <th>Gender</th>
      </tr>
    </thead>
    <tbody>
      {patients.map(pat => (
        <tr key={pat.user._id} onClick={() => onViewProfile(pat.user._id)} style={{ cursor: 'pointer' }}>
          <td>{pat.user.name}</td>
          <td>{pat.user.email}</td>
          <td>{pat.user.phone || 'N/A'}</td>
          <td>{pat.user.address || 'N/A'}</td>
          <td>{pat.profile.dateOfBirth ? new Date(pat.profile.dateOfBirth).toLocaleDateString() : 'N/A'}</td>
          <td>{pat.profile.gender || 'N/A'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const AppointmentRequestsTable = ({ appointmentRequests, handleAssignAppointment }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th>Notes</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {appointmentRequests.map(req => (
        <tr key={req._id}>
          <td>{req.patientId.name}</td>
          <td>{req.notes}</td>
          <td>
            <button onClick={() => handleAssignAppointment(req._id)} className="approve-button">
              Assign Doctor & Schedule
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const AppointmentsTable = ({ appointments, handleRemoveAppointment }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Doctor</th>
        <th>Patient</th>
        <th>Status</th>
        <th>Notes</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {appointments.map(app => (
        <tr key={app._id}>
          <td>{app.dateTime ? new Date(app.dateTime).toLocaleString() : 'Pending'}</td>
          <td>{app.doctorId ? app.doctorId.name : 'Not Assigned'}</td>
          <td>{app.patientId.name}</td>
          <td>{app.status}</td>
          <td>{app.notes || 'N/A'}</td>
          <td>
            <button onClick={() => handleRemoveAppointment(app._id)} className="reject-button">Remove</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const DiagnosesTable = ({ diagnoses }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th>Doctor</th>
        <th>Date</th>
        <th>Condition</th>
        <th>Description</th>
        <th>Treatment</th>
      </tr>
    </thead>
    <tbody>
      {diagnoses.map(diag => (
        <tr key={diag._id}>
          <td>{diag.patientId.name}</td>
          <td>{diag.doctorId.name}</td>
          <td>{new Date(diag.date).toLocaleDateString()}</td>
          <td>{diag.condition}</td>
          <td>{diag.description || 'N/A'}</td>
          <td>{diag.treatment || 'N/A'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const PrescriptionsTable = ({ prescriptions }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th>Doctor</th>
        <th>Date</th>
        <th>Medication</th>
        <th>Dosage</th>
        <th>Duration</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>
      {prescriptions.map(presc => (
        <tr key={presc._id}>
          <td>{presc.patientId.name}</td>
          <td>{presc.doctorId.name}</td>
          <td>{new Date(presc.date).toLocaleDateString()}</td>
          <td>{presc.medication}</td>
          <td>{presc.dosage || 'N/A'}</td>
          <td>{presc.duration || 'N/A'}</td>
          <td>{presc.instructions || 'N/A'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const TestResultsTable = ({ testResults }) => (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Patient</th>
        <th>Doctor</th>
        <th>Test Type</th>
        <th>Date</th>
        <th>Results</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      {testResults.map(test => (
        <tr key={test._id}>
          <td>{test.patientId.name}</td>
          <td>{test.doctorId.name}</td>
          <td>{test.testType}</td>
          <td>{new Date(test.date).toLocaleDateString()}</td>
          <td>{test.results || 'N/A'}</td>
          <td>{test.notes || 'N/A'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const AdminDashboard = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [activeDoctors, setActiveDoctors] = useState([]);
  const [activePatients, setActivePatients] = useState([]);
  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('pending');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [appointmentToAssign, setAppointmentToAssign] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDateTime, setSelectedDateTime] = useState(null);
  const [showDoctorProfileModal, setShowDoctorProfileModal] = useState(false);
  const [selectedDoctorProfile, setSelectedDoctorProfile] = useState(null);
  const [showPatientProfileModal, setShowPatientProfileModal] = useState(false);
  const [selectedPatientProfile, setSelectedPatientProfile] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [
          pendingRes,
          doctorsRes,
          patientsRes,
          appointmentRequestsRes,
          appointmentsRes,
          diagnosesRes,
          prescriptionsRes,
          testResultsRes
        ] = await Promise.all([
          axios.get(`${apiUrl}/admin/pending`, { headers }),
          axios.get(`${apiUrl}/admin/doctors`, { headers }),
          axios.get(`${apiUrl}/admin/patients`, { headers }),
          axios.get(`${apiUrl}/admin/appointment-requests`, { headers }),
          axios.get(`${apiUrl}/admin/appointments`, { headers }),
          axios.get(`${apiUrl}/admin/diagnoses`, { headers }),
          axios.get(`${apiUrl}/admin/prescriptions`, { headers }),
          axios.get(`${apiUrl}/admin/test-results`, { headers }),
        ]);
        setPendingUsers(pendingRes.data);
        setActiveDoctors(doctorsRes.data);
        setActivePatients(patientsRes.data);
        setAppointmentRequests(appointmentRequestsRes.data);
        setAppointments(appointmentsRes.data);
        setDiagnoses(diagnosesRes.data);
        setPrescriptions(prescriptionsRes.data);
        setTestResults(testResultsRes.data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleVerification = async (id, status) => {
    try {
      await axios.put(`${apiUrl}/admin/verify/${id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingUsers(prev => prev.filter(user => user._id !== id));
      alert(`User ${status}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Verification failed');
    }
  };

  const handleViewDoctor = async (id) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${apiUrl}/admin/doctors/${id}/profile`, { headers });
      setSelectedDoctorProfile(response.data);
      setShowDoctorProfileModal(true);
    } catch (error) {
      console.error('Failed to fetch doctor profile:', error);
      alert('Failed to load doctor profile');
    }
  };

  const handleViewPatient = async (id) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${apiUrl}/admin/patients/${id}/profile`, { headers });
      setSelectedPatientProfile(response.data);
      setShowPatientProfileModal(true);
    } catch (error) {
      console.error('Failed to fetch patient profile:', error);
      alert('Failed to load patient profile');
    }
  };

  const handleAssignAppointment = (id) => {
    setAppointmentToAssign(id);
    setShowAssignModal(true);
  };

  const handleRemoveAppointment = async (id) => {
    if (window.confirm('Are you sure you want to remove this appointment?')) {
      try {
        await axios.delete(`${apiUrl}/admin/appointments/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAppointments(prev => prev.filter(app => app._id !== id));
        setAppointmentRequests(prev => prev.filter(req => req._id !== id));
      } catch (error) {
        alert('Failed to remove appointment');
      }
    }
  };

  const assignAppointment = async () => {
    if (!selectedDoctor || !selectedDateTime) {
      alert('Please select a doctor and a date/time');
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.put(`${apiUrl}/admin/appointments/${appointmentToAssign}/assign`, {
        doctorId: selectedDoctor,
        dateTime: selectedDateTime.toISOString(),
      }, { headers });
      setAppointments(prev => [response.data, ...prev.filter(app => app._id !== appointmentToAssign)]);
      setAppointmentRequests(prev => prev.filter(req => req._id !== appointmentToAssign));
      setShowAssignModal(false);
      setSelectedDoctor('');
      setSelectedDateTime(null);
      setAppointmentToAssign(null);
      alert('Appointment assigned and scheduled successfully');
    } catch (error) {
      console.error('Error assigning appointment:', error);
      alert('Failed to assign appointment');
    }
  };

  const sectionComponents = {
    pending: <PendingUsersTable pendingUsers={pendingUsers} handleVerification={handleVerification} />,
    doctors: <DoctorsTable doctors={activeDoctors} onViewProfile={handleViewDoctor} />,
    patients: <PatientsTable patients={activePatients} onViewProfile={handleViewPatient} />,
    appointmentRequests: (
      <AppointmentRequestsTable
        appointmentRequests={appointmentRequests}
        handleAssignAppointment={handleAssignAppointment}
      />
    ),
    appointments: (
      <AppointmentsTable
        appointments={appointments}
        handleRemoveAppointment={handleRemoveAppointment}
      />
    ),
    diagnoses: <DiagnosesTable diagnoses={diagnoses} />,
    prescriptions: <PrescriptionsTable prescriptions={prescriptions} />,
    testResults: <TestResultsTable testResults={testResults} />,
  };

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Admin Dashboard</h1>
      <div className="dashboard-container">
        <div className="dashboard-sidebar">
          {sections.map(section => (
            <button
              key={section.key}
              className={`section-button ${selectedSection === section.key ? "active" : ""}`}
              onClick={() => setSelectedSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="dashboard-content">
          {loading ? (
            <div className="loading">Loading dashboard...</div>
          ) : (
            <>
              <h2 className="section-title">
                {sections.find(s => s.key === selectedSection)?.label}
              </h2>
              {sectionComponents[selectedSection]}
            </>
          )}
        </div>
      </div>
      {showAssignModal && (
        <div className="modal" style={{ position: 'fixed', top: '20%', left: '30%', background: 'white', padding: '20px', border: '1px solid #ccc' }}>
          <h3>Assign Doctor and Schedule Appointment</h3>
          <label>Doctor:</label>
          <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
            <option value="">Select Doctor</option>
            {activeDoctors.map(doc => (
              <option key={doc.user._id} value={doc.user._id}>{doc.user.name}</option>
            ))}
          </select>
          <label>Date and Time:</label>
          <DatePicker
            selected={selectedDateTime}
            onChange={date => setSelectedDateTime(date)}
            showTimeSelect
            dateFormat="Pp"
            minDate={new Date()}
          />
          <div style={{ marginTop: '10px' }}>
            <button onClick={assignAppointment} className="approve-button">Assign & Schedule</button>
            <button onClick={() => setShowAssignModal(false)} className="reject-button">Cancel</button>
          </div>
        </div>
      )}
      {showDoctorProfileModal && selectedDoctorProfile && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'white', padding: '20px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="profile-view">
              <h2>Doctor Profile</h2>
              {selectedDoctorProfile.profilePicture && (
                <img src={selectedDoctorProfile.profilePicture} alt="Profile" className="profile-pic" />
              )}
              <p><strong>Name:</strong> {selectedDoctorProfile.doctorId.name}</p>
              <p><strong>Email:</strong> {selectedDoctorProfile.doctorId.email}</p>
              <p><strong>Phone:</strong> {selectedDoctorProfile.doctorId.phone || 'N/A'}</p>
              <p><strong>Address:</strong> {selectedDoctorProfile.doctorId.address || 'N/A'}</p>
              <p><strong>Specialization:</strong> {selectedDoctorProfile.specialization || 'N/A'}</p>
              <p><strong>License Number:</strong> {selectedDoctorProfile.licenseNumber || 'N/A'}</p>
              <p><strong>Years of Experience:</strong> {selectedDoctorProfile.yearsOfExperience || 'N/A'}</p>
              <div>
                <strong>Education:</strong>
                {selectedDoctorProfile.education && selectedDoctorProfile.education.length > 0 ? (
                  <ul>
                    {selectedDoctorProfile.education.map((edu, index) => (
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
                {selectedDoctorProfile.certifications && selectedDoctorProfile.certifications.length > 0 ? (
                  <ul>
                    {selectedDoctorProfile.certifications.map((cert, index) => (
                      <li key={index}>{cert}</li>
                    ))}
                  </ul>
                ) : (
                  <p>N/A</p>
                )}
              </div>
            </div>
            <button onClick={() => setShowDoctorProfileModal(false)} className="close-button">Close</button>
          </div>
        </div>
      )}
      {showPatientProfileModal && selectedPatientProfile && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'white', padding: '20px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="profile-view">
              <h2>Patient Profile</h2>
              {selectedPatientProfile.profilePicture && (
                <img src={selectedPatientProfile.profilePicture} alt="Profile" className="profile-pic" />
              )}
              <p><strong>Name:</strong> {selectedPatientProfile.patientId.name}</p>
              <p><strong>Email:</strong> {selectedPatientProfile.patientId.email}</p>
              <p><strong>Phone:</strong> {selectedPatientProfile.patientId.phone || 'N/A'}</p>
              <p><strong>Address:</strong> {selectedPatientProfile.patientId.address || 'N/A'}</p>
              <p><strong>Date of Birth:</strong> {selectedPatientProfile.dateOfBirth ? new Date(selectedPatientProfile.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
              <p><strong>Gender:</strong> {selectedPatientProfile.gender || 'N/A'}</p>
              <p><strong>Blood Type:</strong> {selectedPatientProfile.bloodType || 'N/A'}</p>
              <div>
                <strong>Allergies:</strong>
                {selectedPatientProfile.allergies && selectedPatientProfile.allergies.length > 0 ? (
                  <ul>
                    {selectedPatientProfile.allergies.map((allergy, index) => (
                      <li key={index}>{allergy}</li>
                    ))}
                  </ul>
                ) : (
                  <p>N/A</p>
                )}
              </div>
              <div>
                <strong>Medical History:</strong>
                {selectedPatientProfile.medicalHistory && selectedPatientProfile.medicalHistory.length > 0 ? (
                  <ul>
                    {selectedPatientProfile.medicalHistory.map((history, index) => (
                      <li key={index}>
                        {history.condition} - {history.date ? new Date(history.date).toLocaleDateString() : 'N/A'} - {history.notes || 'N/A'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>N/A</p>
                )}
              </div>
              <div>
                <strong>Current Medications:</strong>
                {selectedPatientProfile.currentMedications && selectedPatientProfile.currentMedications.length > 0 ? (
                  <ul>
                    {selectedPatientProfile.currentMedications.map((med, index) => (
                      <li key={index}>{med}</li>
                    ))}
                  </ul>
                ) : (
                  <p>N/A</p>
                )}
              </div>
              <p><strong>Insurance Provider:</strong> {selectedPatientProfile.insuranceInfo?.provider || 'N/A'}</p>
              <p><strong>Policy Number:</strong> {selectedPatientProfile.insuranceInfo?.policyNumber || 'N/A'}</p>
              <p><strong>Emergency Contact:</strong> {selectedPatientProfile.emergencyContact?.name || 'N/A'} ({selectedPatientProfile.emergencyContact?.relation || 'N/A'}) - {selectedPatientProfile.emergencyContact?.phone || 'N/A'}</p>
            </div>
            <button onClick={() => setShowPatientProfileModal(false)} className="close-button">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;