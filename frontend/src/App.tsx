import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import FieldSetup from "./pages/FieldSetup";
import History from "./pages/History";
import Savings from "./pages/Savings";
import About from "./pages/About";

// HashRouter: GitHub Pages is static, so deep links like /zameendost/history would 404 on refresh. Hash routes never do.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} /><Route path="field" element={<FieldSetup />} /><Route path="history" element={<History />} />
          <Route path="savings" element={<Savings />} /><Route path="about" element={<About />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
