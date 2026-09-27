export const metadata = {
  title: 'LHG Isabelle',
  description: 'Internal business automation for LHG Import Export Hub Sdn Bhd',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
