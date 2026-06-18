import { useState } from 'react'
import LandingPage from './components/LandingPage'
import AppView from './components/AppView'
import './App.css'

function App() {
  const [view, setView] = useState('landing') // landing, app

  return (
    <div className="app">
      {view === 'landing' ? (
        <LandingPage onGetStarted={() => setView('app')} />
      ) : (
        <AppView onBack={() => setView('landing')} />
      )}
    </div>
  )
}

export default App
