// src/components/DoctorDashboard.jsx

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../Designs/DoctorDashboard.css';

const apiUrl = import.meta.env.VITE_API_URL;

const isToday = (date) => {
  const today = new Date();
  const appointmentDate = new Date(date);
  return today.toDateString() === appointmentDate.toDateString();
};

// --- NEW: Helper function to get the greeting based on the time ---
const getGreeting = () => {
  const currentHour = new Date().getHours();
  if (currentHour < 12) {
    return 'Good Morning';
  } else if (currentHour < 18) {
    return 'Good Afternoon';
  } else {
    return 'Good Evening';
  }
};

const DoctorDashboard = () => {
  // --- NEW: State to store the doctor's name ---
  const [doctorName, setDoctorName] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        // --- UPDATED: Fetch doctor profile and appointments at the same time ---
        const [profileRes, appointmentsRes] = await Promise.all([
          // NOTE: Replace '/doctor/profile' with your actual endpoint to get user details
          axios.get(`${apiUrl}/doctor/profile`, { headers }),
          axios.get(`${apiUrl}/doctor/appointments`, { headers }),
        ]);

        // --- NEW: Set the doctor's name from the API response ---
        setDoctorName(profileRes.data.name || 'Doctor'); // Fallback to 'Doctor'
        setAppointments(appointmentsRes.data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleUpdateAppointment = async (id, updates) => {
    try {
      const response = await axios.put(`${apiUrl}/doctor/appointments/${id}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(prev => prev.map(app => app._id === id ? response.data : app));
    } catch (error) {
      alert('Failed to update appointment: ' + (error.response?.data?.message || error.message));
    }
  };

  const goToProfile = () => {
    navigate('/doctor/profile');
  };

  return (
    <div className="doctor-dashboard">
      {/* --- UPDATED: Dynamic greeting header --- */}
      <h1 className="dashboard-title">{getGreeting()}, Dr. {doctorName}</h1>
      <button onClick={goToProfile} className="btn-primary profile-btn">
        View My Profile
      </button>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="appointments-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map(app => (
              <tr key={app._id}>
                <td>{app.patientId.name}</td>
                <td>
                  {app.dateTime ? new Date(app.dateTime).toLocaleString() : 'Not Set'}
                </td>
                <td>{app.status}</td>
                <td>{app.notes || 'N/A'}</td>
                <td>
                  {app.status === 'scheduled' && (
                    <>
                      <button
                        onClick={() => handleUpdateAppointment(app._id, { status: 'confirmed' })}
                        className="btn-success"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleUpdateAppointment(app._id, { status: 'rejected' })}
                        className="btn-danger"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {app.status === 'confirmed' && (
                    <>
                      <button
                        onClick={() => handleUpdateAppointment(app._id, { status: 'completed' })}
                        className="btn-success"
                        disabled={!app.dateTime || new Date() < new Date(app.dateTime)}
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleUpdateAppointment(app._id, { status: 'canceled' })}
                        className="btn-danger"
                      >
                        Cancel
                      </button>
                      {isToday(app.dateTime) && (
                        <button
                          onClick={() => navigate(`/chat/${app.patientId._id}`)}
                          className="btn-primary"
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
    </div>
  );
};

export default DoctorDashboard;