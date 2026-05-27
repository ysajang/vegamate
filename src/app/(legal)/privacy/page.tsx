import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - VegaMate',
  description: 'VegaMate privacy policy. How we collect, use, and protect your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      <h1 className="mb-8 text-2xl font-bold text-foreground">
        Privacy Policy
      </h1>

      <p className="mb-8">
        This Privacy Policy describes how VegaMate (&quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, and shares
        information when you use our website and services at vegamate.com
        (the &quot;Service&quot;). By using the Service, you agree to the
        practices described in this policy.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          1. Information we collect
        </h2>

        <h3 className="mb-2 mt-4 text-base font-medium text-foreground">
          Account information
        </h3>
        <p className="mb-3">
          When you create an account, we collect your email address and
          display name. If you sign in through a third-party provider
          (e.g., Google), we receive basic profile information from that
          provider.
        </p>

        <h3 className="mb-2 mt-4 text-base font-medium text-foreground">
          Conversation data
        </h3>
        <p className="mb-3">
          We store messages you exchange with AI characters to maintain
          conversation history and improve your experience. This includes
          text messages and metadata such as timestamps.
        </p>

        <h3 className="mb-2 mt-4 text-base font-medium text-foreground">
          Usage data
        </h3>
        <p className="mb-3">
          We automatically collect certain information when you use the
          Service, including your IP address, browser type, device
          information, pages visited, and referring URLs. We use analytics
          tools to understand how users interact with our Service.
        </p>

        <h3 className="mb-2 mt-4 text-base font-medium text-foreground">
          Payment information
        </h3>
        <p>
          Payments are processed by our third-party payment processor
          (Creem). We do not store your credit card number or full
          payment details. We only receive transaction confirmations
          and identifiers necessary to credit your account.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          2. How we use your information
        </h2>
        <p className="mb-3">We use the information we collect to:</p>
        <ul className="mb-3 list-inside list-disc space-y-1.5">
          <li>Provide, operate, and maintain the Service</li>
          <li>Personalize your experience with AI characters</li>
          <li>Process transactions and send related information</li>
          <li>Send service-related notifications (e.g., push notifications you opt into)</li>
          <li>Monitor and analyze usage trends to improve the Service</li>
          <li>Detect, prevent, and address abuse, fraud, or technical issues</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>
          We do <strong>not</strong> use your conversation data to train
          AI models. Your conversations are used solely to provide you
          with the Service.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          3. How we share your information
        </h2>
        <p className="mb-3">
          We do not sell your personal information. We may share your
          information in the following circumstances:
        </p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <strong>Service providers:</strong> We share data with
            third-party providers that help us operate the Service
            (e.g., hosting, analytics, payment processing, AI
            inference). These providers are bound by confidentiality
            obligations.
          </li>
          <li>
            <strong>Legal requirements:</strong> We may disclose
            information if required by law, regulation, or valid legal
            process.
          </li>
          <li>
            <strong>Safety:</strong> We may share information when we
            believe in good faith that disclosure is necessary to
            protect the safety of our users or the public.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          4. Data retention
        </h2>
        <p>
          We retain your account and conversation data for as long as
          your account is active. If you delete your account, we will
          delete your personal data within 30 days, except where we are
          required to retain it for legal or compliance purposes. Some
          anonymized or aggregated data may be retained for analytics.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          5. Data security
        </h2>
        <p>
          We implement industry-standard security measures to protect
          your data, including encryption in transit (TLS) and at rest.
          However, no method of transmission over the Internet is 100%
          secure. We cannot guarantee absolute security.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          6. Your rights
        </h2>
        <p className="mb-3">
          Depending on your location, you may have the following rights:
        </p>
        <ul className="mb-3 list-inside list-disc space-y-1.5">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to or restrict processing of your data</li>
          <li>Data portability</li>
          <li>Withdraw consent at any time</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a
            href="mailto:support@vegamate.com"
            className="text-blue-400 underline hover:text-blue-300"
          >
            support@vegamate.com
          </a>
          .
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          7. Cookies and tracking
        </h2>
        <p>
          We use essential cookies to maintain your session and
          authentication state. We may use analytics cookies (such as
          Google Analytics) to understand usage patterns. You can
          control cookie preferences through your browser settings.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          8. Children&apos;s privacy
        </h2>
        <p>
          The Service is not intended for users under the age of 18. We
          do not knowingly collect personal information from children. If
          we become aware that a user under 18 has provided us with
          personal information, we will take steps to delete that
          information.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          9. International data transfers
        </h2>
        <p>
          Your data may be processed in countries other than your own,
          including the United States and South Korea. By using the
          Service, you consent to the transfer of your information to
          these countries.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          10. Changes to this policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time. We will
          notify you of material changes by posting the updated policy on
          this page and updating the &quot;Last updated&quot; date. Your
          continued use of the Service after changes constitutes
          acceptance of the updated policy.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          11. Contact us
        </h2>
        <p>
          If you have any questions about this Privacy Policy, please
          contact us at{' '}
          <a
            href="mailto:support@vegamate.com"
            className="text-blue-400 underline hover:text-blue-300"
          >
            support@vegamate.com
          </a>
          .
        </p>
      </section>

      <footer className="border-t border-border/30 pt-6 text-xs text-muted-foreground/60">
        Last updated: May 2026
      </footer>
    </main>
  );
}
