import React from 'react';
import '../Designs/Landing.css'; 

function Landing() {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>Welcome to MedSystem</h1>
          <p>
            Revolutionizing healthcare by connecting patients and doctors for faster appointments and seamless access to medical services without leaving your home.
          </p>
          <div className="hero-buttons">
            <a href="/roleselect" className="btn-hero-signup">Get Started - Sign Up</a>
            <a href="/login" className="btn-hero-login">Log In</a>
          </div>
        </div>
      </section>

{/* About Section */}
<section id="about" className="about-section">
  <div className="section-container">
    <h2>About MedSystem</h2>
    <p>
      MedSystem is an innovative healthcare management platform that simplifies the way patients, doctors, and administrators connect. 
      Our system allows patients to easily book and manage appointments with their preferred doctors, while providing doctors with 
      tools to organize their schedules and deliver care more efficiently. Administrators have full oversight of all appointments, 
      ensuring smooth coordination across the hospital or clinic.
    </p>
    <p>
      Our mission is to improve access to healthcare by creating a seamless appointment experience that reduces waiting times, 
      eliminates scheduling conflicts, and enhances communication between patients and healthcare providers. 
      With MedSystem, we aim to bridge the gap between medical professionals and patients through technology, 
      making healthcare more organized, accessible, and patient-focused.
    </p>
    <p>
      Founded with a vision to modernize healthcare operations, MedSystem continues to evolve with features such as 
      secure virtual consultations, automated reminders, and real-time updates. 
      Whether you are a patient in need of quick access to a doctor, a doctor managing a busy practice, or 
      an admin overseeing operations, MedSystem is built to make healthcare simple and efficient.
    </p>
  </div>
</section>

      {/* Services Section */}
      <section id="services" className="services-section">
        <div className="section-container">
          <h2>Our Services</h2>
          <div className="services-grid">
            <div className="service-card">
              <h3>Online Appointments</h3>
              <p>Schedule appointments with doctors instantly without visiting the hospital.</p>
            </div>
            <div className="service-card">
              <h3>Live Chat & Video Chat</h3>
              <p>Communicate in real-time with healthcare professionals via chat or video calls.</p>
            </div>
            <div className="service-card">
              <h3>Dashboards for All</h3>
              <p>Custom dashboards for admins, doctors, and patients to manage profiles, complaints, and prescriptions.</p>
            </div>
            <div className="service-card">
              <h3>Complaint & Scheduling</h3>
              <p>Patients can submit complaints, and admins can schedule online consultations efficiently.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="contact-section">
        <div className="section-container">
          <h2>Contact Us</h2>
          <p>
            [ Email: fluidatom025@gmail.com | Phone: +234 8149335394 | Lagos, Nigeria]
          </p>
          <form className="contact-form">
            <input type="text" placeholder="Your Name" required />
            <input type="email" placeholder="Your Email" required />
            <textarea placeholder="Your Message" required></textarea>
            <button type="submit" className="btn-contact">Send Message</button>
          </form>
          <p>[Note: This form is a placeholder; implement backend submission as needed.]</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <p>&copy; 2025 MedSystem. All rights reserved.</p>
          <div className="footer-links">
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#contact">Contact</a>
            <a href="/privacy">Privacy Policy</a> 
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;