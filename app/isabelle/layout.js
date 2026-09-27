const styles = {
  page: { maxWidth: '760px', margin: '0 auto', padding: '0 24px 60px', lineHeight: 1.6, color: '#1a1a1a' },
  header: { borderBottom: '1px solid #e5e5e5', padding: '32px 0', marginBottom: '32px' },
  headerInner: { maxWidth: '760px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: '20px', fontWeight: 700, color: '#1a1a1a', textDecoration: 'none' },
  nav: { display: 'flex', gap: '20px' },
  navLink: { color: '#555', textDecoration: 'none', fontSize: '14px' },
  footer: { borderTop: '1px solid #e5e5e5', marginTop: '60px', paddingTop: '24px', fontSize: '13px', color: '#888' },
};

export default function IsabelleLayout({ children }) {
  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <a href="/isabelle" style={styles.brand}>LHG Isabelle</a>
          <nav style={styles.nav}>
            <a href="/isabelle" style={styles.navLink}>Home</a>
            <a href="/isabelle/privacy" style={styles.navLink}>Privacy Policy</a>
            <a href="/isabelle/terms" style={styles.navLink}>Terms of Service</a>
          </nav>
        </div>
      </header>
      <div style={styles.page}>
        {children}
        <footer style={styles.footer}>
          LHG Isabelle is operated by LHG Import Export Hub Sdn Bhd, part of LHG Group.
        </footer>
      </div>
    </>
  );
}
