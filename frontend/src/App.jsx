import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './Headers/Header'; // Adjust path if needed
import Landing from './Headers/Landing'; // Adjust path if needed
import RoleSelection from './AuthPages/RoleSelection';
import InitialRegister from './AuthPages/InitialRegister';
import CompleteRegister from './AuthPages/CompleteRegister';
import Login from './AuthPages/Login';
import Dashboard from './AuthPages/Dashboard';
import AdminDashboard from './Dashboard/AdminDashboard';
import PatientProfile from './Dashboard/PatientProfile';
import DoctorProfile from './Dashboard/DoctorProfile';
import DoctorDashboard from './Dashboard/DoctorDashboard';
import PatientDashboard from './Dashboard/PatientDashboard';
import DiagnosisPrescriptionForm from './Forms/DiagnosisPrescriptionForm';
import Chat from './Chats/Chat';
import VideoCall from './Chats/VideoCall'; 
import './App.css';

function App() {
  return (
    <Router>
      <Header /> {/* Header is now visible across the entire app */}
      <Routes>
        <Route path="/" element={<Landing />} /> {/* New landing page at root */}
        <Route path="/login" element={<Login />} /> {/* Moved login to /login */}
        <Route path="/roleselect" element={<RoleSelection />} />
        <Route path="/register" element={<InitialRegister />} />
        <Route path="/complete-registration" element={<CompleteRegister />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admindashboard" element={<AdminDashboard />} />
        <Route path="/doctor/profile" element={<DoctorProfile />} />
        <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
        <Route path="/patient/dashboard" element={<PatientDashboard />} />
        <Route path= "/patient/profile" element={<PatientProfile />} />
        <Route path="/chat/:userId" element={<Chat />} />
        <Route path="/diagnosis-prescription/:patientId" element={<DiagnosisPrescriptionForm />} />
        <Route path="/video-call/:userId" element={<VideoCall />} />
      </Routes>
    </Router>
  );
}

export default App;