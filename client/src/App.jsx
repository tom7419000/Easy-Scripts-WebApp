import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PublicPage from './public/PublicPage.jsx';
import AdminApp from './admin/AdminApp.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicPage />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
