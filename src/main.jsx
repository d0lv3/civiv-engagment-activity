import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Participate from './pages/Participate'
import CloudView from './pages/CloudView'
import Admin from './pages/Admin'
import './styles.css'

// HashRouter: deep links like /#/admin and /#/cloud work on any static host
// (GitHub Pages included) with zero server configuration.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Participate />} />
        <Route path="/cloud" element={<CloudView />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
