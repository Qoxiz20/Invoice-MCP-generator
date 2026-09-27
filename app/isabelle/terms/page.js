export const metadata = {
  title: 'Terms of Service - LHG Isabelle',
};

export default function TermsPage() {
  return (
    <main>
      <h1>Terms of Service</h1>
      <p><em>Last updated: {new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern the use of LHG Isabelle (&quot;the
        application&quot;), operated by LHG Import Export Hub Sdn Bhd (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;). By accessing or using the application, you agree to these Terms.
      </p>

      <h2>1. Authorized use</h2>
      <p>
        LHG Isabelle is an internal business application intended solely for use by
        personnel authorized by LHG Import Export Hub Sdn Bhd. Access is granted at
        our discretion and may be limited to specific individuals, Google accounts,
        or business functions.
      </p>

      <h2>2. Account and security responsibilities</h2>
      <p>
        Users are responsible for maintaining the security of any account or
        credentials used to access the application, including their connected Google
        account. Users must not share access credentials with unauthorized parties
        and must notify us promptly if they suspect unauthorized access.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to use the application to:</p>
      <ul>
        <li>Access, modify, or delete data you are not authorized to access</li>
        <li>Attempt to circumvent authentication, authorization, or security controls</li>
        <li>Use the application for any purpose unrelated to LHG Import Export Hub Sdn Bhd&apos;s business operations</li>
        <li>Interfere with or disrupt the application&apos;s normal operation</li>
      </ul>

      <h2>4. Service availability</h2>
      <p>
        We aim to keep the application available and functioning as intended, but we
        do not guarantee uninterrupted or error-free operation. The application may
        be unavailable at times due to maintenance, updates, or factors outside our
        control (including third-party service outages).
      </p>

      <h2>5. Changes to the application</h2>
      <p>
        We may modify, update, or discontinue features of the application at any time
        as our business needs change, without prior notice.
      </p>

      <h2>6. Termination</h2>
      <p>
        We may suspend or terminate access to the application for any user at our
        discretion, including where use violates these Terms or where access is no
        longer required for business purposes. Users may also request that their
        access be revoked at any time.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        The application is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
        fullest extent permitted by applicable law, LHG Import Export Hub Sdn Bhd
        shall not be liable for any indirect, incidental, or consequential damages
        arising from the use of, or inability to use, the application. Nothing in
        these Terms limits liability that cannot be excluded under applicable law.
      </p>

      <h2>8. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The &quot;Last updated&quot; date at the
        top of this page will reflect the most recent revision. Continued use of the
        application after changes take effect constitutes acceptance of the revised
        Terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        For questions about these Terms, contact LHG Import Export Hub Sdn Bhd
        directly.
      </p>
    </main>
  );
}
