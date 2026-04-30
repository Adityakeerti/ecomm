// No separate CSS import needed — globals.css is loaded by the root layout
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';

export default function StoreLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="page-content">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
