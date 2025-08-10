import React from 'react';

function Dashboard() {
  const role = localStorage.getItem('role');

  return (
    <div
      style={{
        minHeight: '100vh',           // min-h-screen
        display: 'flex',              // flex
        alignItems: 'center',         // items-center
        justifyContent: 'center',     // justify-center
        backgroundColor: '#f3f4f6',   // bg-gray-100
      }}
    >
      <h1
        style={{
          fontSize: '1.875rem',       // text-3xl (~30px)
          fontWeight: 'bold',         // font-bold
          margin: 0,
        }}
      >
        Welcome, {role}
      </h1>
    </div>
  );
}

export default Dashboard;
