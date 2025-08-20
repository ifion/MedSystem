import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../Designs/Landing.css';

function Landing() {
  useEffect(() => {
    // Intersection Observer for fade-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content fade-in">
          <h1>
            <span className="gradient-text">Revolutionary Healthcare</span>
            <br />
            At Your Fingertips
          </h1>
          <p className="hero-subtitle">
            Connect with top healthcare providers instantly through secure video consultations,
            real-time chat, and seamless appointment scheduling.
          </p>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-number">1000+</span>
              <span className="stat-label">Doctors</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">50k+</span>
              <span className="stat-label">Patients</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">98%</span>
              <span className="stat-label">Satisfaction</span>
            </div>
          </div>
          <div className="hero-buttons">
            <Link to="/roleselect" className="btn-primary">
              Get Started
              <span className="btn-icon">→</span>
            </Link>
            <Link to="/about" className="btn-secondary">
              Learn More
            </Link>
          </div>
        </div>
        <div className="hero-image fade-in">
          {/* Add your hero image here */}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="section-container">
          <h2 className="section-title fade-in">Why Choose MedSystem?</h2>
          <div className="features-grid">
            <div className="feature-card fade-in">
              <div className="feature-icon">🏥</div>
              <h3>Virtual Consultations</h3>
              <p>Connect with healthcare providers from the comfort of your home</p>
            </div>
            <div className="feature-card fade-in">
              <div className="feature-icon">📱</div>
              <h3>Smart Scheduling</h3>
              <p>AI-powered appointment scheduling system</p>
            </div>
            <div className="feature-card fade-in">
              <div className="feature-icon">💊</div>
              <h3>Digital Prescriptions</h3>
              <p>Receive and manage prescriptions electronically</p>
            </div>
            <div className="feature-card fade-in">
              <div className="feature-icon">💬</div>
              <h3>Secure Messaging</h3>
              <p>HIPAA-compliant chat with your healthcare team</p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about-section">
        <div className="section-container">
          <div className="about-content">
            <div className="about-text fade-in">
              <h2 className="section-title">About MedSystem</h2>
              <p className="about-description">
                MedSystem is revolutionizing healthcare delivery through our comprehensive
                telemedicine platform. We bring together patients, doctors, and healthcare
                administrators in one seamless ecosystem.
              </p>
              <div className="about-features">
                <div className="about-feature">
                  <span className="feature-check">✓</span>
                  24/7 Access to Healthcare
                </div>
                <div className="about-feature">
                  <span className="feature-check">✓</span>
                  Secure & HIPAA Compliant
                </div>
                <div className="about-feature">
                  <span className="feature-check">✓</span>
                  Integrated Health Records
                </div>
              </div>
            </div>
            <div className="about-image fade-in">
              {/* Add about section image */}
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="services-section">
        <div className="section-container">
          <h2 className="section-title fade-in">Our Services</h2>
          <div className="services-grid">
            {/* Patient Services */}
            <div className="service-category fade-in">
              <h3>For Patients</h3>
              <ul className="service-list">
                <li>Online Appointment Booking</li>
                <li>Video Consultations</li>
                <li>Secure Messaging</li>
                <li>Digital Prescriptions</li>
                <li>Health Records Access</li>
                <li>Appointment Reminders</li>
              </ul>
            </div>

            {/* Doctor Services */}
            <div className="service-category fade-in">
              <h3>For Doctors</h3>
              <ul className="service-list">
                <li>Patient Management</li>
                <li>Schedule Management</li>
                <li>Digital Prescription Tools</li>
                <li>Video Consultation Platform</li>
                <li>Patient History Access</li>
                <li>Analytics Dashboard</li>
              </ul>
            </div>

            {/* Admin Services */}
            <div className="service-category fade-in">
              <h3>For Administrators</h3>
              <ul className="service-list">
                <li>User Management</li>
                <li>Analytics & Reports</li>
                <li>Resource Allocation</li>
                <li>Complaint Management</li>
                <li>System Configuration</li>
                <li>Audit Trails</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="contact-section">
        <div className="section-container">
          <h2 className="section-title fade-in">Get in Touch</h2>
          <div className="contact-grid">
            <div className="contact-info fade-in">
              <h3>Contact Information</h3>
              <div className="contact-details">
                <div className="contact-item">
                  <span className="contact-icon">📧</span>
                  <a href="mailto:fluidatom025@gmail.com">fluidatom025@gmail.com</a>
                </div>
                <div className="contact-item">
                  <span className="contact-icon">📞</span>
                  <a href="tel:+2348149335394">+234 814 933 5394</a>
                </div>
                <div className="contact-item">
                  <span className="contact-icon">📍</span>
                  <address>Lagos, Nigeria</address>
                </div>
              </div>
              <div className="social-links">
                <a href="#" className="social-link">
                  <i className="fab fa-facebook"></i>
                </a>
                <a href="#" className="social-link">
                  <i className="fab fa-twitter"></i>
                </a>
                <a href="#" className="social-link">
                  <i className="fab fa-linkedin"></i>
                </a>
              </div>
            </div>
            <form className="contact-form fade-in">
              <div className="form-group">
                <input type="text" placeholder="Your Name" required />
              </div>
              <div className="form-group">
                <input type="email" placeholder="Your Email" required />
              </div>
              <div className="form-group">
                <select required>
                  <option value="">Select Subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="support">Technical Support</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <div className="form-group">
                <textarea placeholder="Your Message" required></textarea>
              </div>
              <button type="submit" className="btn-submit">
                Send Message
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>MedSystem</h3>
            <p>Revolutionizing healthcare through technology</p>
            <div className="footer-social">
              <a href="#"><i className="fab fa-facebook"></i></a>
              <a href="#"><i className="fab fa-twitter"></i></a>
              <a href="#"><i className="fab fa-linkedin"></i></a>
              <a href="#"><i className="fab fa-instagram"></i></a>
            </div>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#about">About Us</a></li>
              <li><a href="#services">Services</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Services</h4>
            <ul>
              <li><a href="#">Telemedicine</a></li>
              <li><a href="#">Online Consultations</a></li>
              <li><a href="#">Health Records</a></li>
              <li><a href="#">Prescriptions</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Cookie Policy</a></li>
              <li><a href="#">HIPAA Compliance</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 MedSystem. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;