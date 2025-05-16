import './App.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
import EComDataFinder from './components/EcomDataFinder';

function App() {

  return (
    <>
    <BrowserRouter>
      <Routes>
          <Route path="/test" element={<EComDataFinder />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}

export default App
