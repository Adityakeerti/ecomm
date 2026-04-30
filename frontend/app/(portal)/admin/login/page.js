'use client';
import { AdminPage, LoginPage } from '../AdminComponents';

export default function Page() {
  return <AdminPage noShell><LoginPage /></AdminPage>;
}
