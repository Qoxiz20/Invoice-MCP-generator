export const metadata = {
  title: 'Privacy Policy - LHG Isabelle',
};

export default function PrivacyPolicyPage() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <p>
        This Privacy Policy explains how LHG Isabelle (&quot;the application&quot;), operated
        by LHG Import Export Hub Sdn Bhd (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), accesses and uses data
        when connected to Google services.
      </p>

      <h2>1. Who this applies to</h2>
      <p>
        LHG Isabelle is an internal business application used by authorized personnel
        of LHG Import Export Hub Sdn Bhd. It is not intended for use by the general
        public.
      </p>

      <h2>2. What we access</h2>
      <p>
        With explicit authorization from a Google account holder, LHG Isabelle may
        access:
      </p>
      <ul>
        <li>Google Drive files and folders the authorized user grants access to</li>
        <li>Google Sheets data the authorized user grants access to</li>
      </ul>
      <p>
        Access is granted through Google&apos;s own OAuth authorization flow. We only
        request the scopes necessary for the application to function, and access is
        limited to what the authorizing account permits.
      </p>

      <h2>3. How we use this data</h2>
      <p>
        Data accessed through Google Drive and Google Sheets is used solely for
        internal business automation and document workflow purposes, including:
      </p>
      <ul>
        <li>Organizing and filing business documents (such as invoices, purchase orders, and receipts)</li>
        <li>Reading and updating structured business records (such as pricing, customer/supplier information, and transaction logs)</li>
        <li>Generating business documents based on existing records</li>
      </ul>
      <p>
        We do not sell this data. We do not use this data for advertising, and we do
        not share it with third parties except where necessary to operate the
        application itself (such as the hosting and infrastructure providers listed
        in Section 6).
      </p>

      <h2>4. Data security</h2>
      <p>
        Access credentials are stored as encrypted environment variables on our
        hosting provider and are not exposed in source code or logs. Communication
        between the application and Google&apos;s services uses standard encrypted
        connections (HTTPS/TLS).
      </p>

      <h2>5. Data retention</h2>
      <p>
        LHG Isabelle does not maintain a separate copy or database of your Google
        Drive or Sheets content. Data is read from or written to your Google account
        at the time an action is performed; the application does not independently
        store a duplicate of that content beyond what is temporarily needed to
        complete the requested action.
      </p>

      <h2>6. Third-party infrastructure</h2>
      <p>
        The application is hosted using standard third-party infrastructure and
        service providers (such as cloud hosting and database services) that support
        its technical operation. These providers process data solely to support the
        application&apos;s functionality and are not authorized to use it for their own
        purposes.
      </p>

      <h2>7. Revoking access</h2>
      <p>
        You can revoke LHG Isabelle&apos;s access to your Google account at any time via
        your Google Account&apos;s security settings, under &quot;Third-party apps with
        account access&quot; (
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
          myaccount.google.com/permissions
        </a>
        ). Revoking access will stop the application from being able to read or write
        any further data on your behalf.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time to reflect changes in how
        the application operates. The &quot;Last updated&quot; date at the top of this page
        will reflect the most recent revision.
      </p>

      <h2>9. Contact</h2>
      <p>
        For questions about this Privacy Policy or how your data is handled, contact
        LHG Import Export Hub Sdn Bhd directly.
      </p>
    </main>
  );
}
