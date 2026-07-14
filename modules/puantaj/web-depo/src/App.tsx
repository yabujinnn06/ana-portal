import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Oturumlar from "./pages/Oturumlar";
import Sayim from "./pages/Sayim";
import Admin from "./pages/Admin";
import Rapor from "./pages/Rapor";
import ZimmetSenedi from "./pages/ZimmetSenedi";
import Zimmet from "./pages/Zimmet";
import Layout from "./components/Layout";

function Guard({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-ink/55 text-sm">Yukleniyor…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.rol !== "admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Oturumlar />} />
        <Route path="/sayim/:id" element={<Sayim />} />
        <Route path="/sayim/:id/rapor" element={<Rapor />} />
        <Route path="/zimmet-senedi" element={<ZimmetSenedi />} />
        <Route path="/zimmet" element={<Zimmet />} />
        <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
      </Route>
    </Routes>
  );
}
