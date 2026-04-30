// No separate CSS import needed — globals.css is loaded by the root layout

export default function PortalLayout({ children }) {
  // No storefront nav — admin and delivery have their own chrome
  return <>{children}</>;
}
