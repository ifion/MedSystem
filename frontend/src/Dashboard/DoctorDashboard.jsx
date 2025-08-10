import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../Designs/DoctorDashboard.css'; // Import the new CSS file

const apiUrl = import.meta.env.VITE_API_URL;

const isToday = (date) => {
  const today = new Date();
  const appointmentDate = new Date(date);
  return today.toDateString() === appointmentDate.toDateString();
};

const DoctorDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const response = await axios.get(`${apiUrl}/doctor/appointments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAppointments(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load appointments:', error);
        setLoading(false);
      }
    };
    fetchAppointments();
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
      <h1 className="dashboard-title">Doctor Dashboard</h1>
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
