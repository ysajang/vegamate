import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - VegaMate',
  description: 'VegaMate terms of service. Rules and conditions for using our platform.',
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      <h1 className="mb-8 text-2xl font-bold text-foreground">
        Terms of Service
      </h1>

      <p className="mb-8">
        These Terms of Service (&quot;Terms&quot;) govern your access to
        and use of VegaMate (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) at vegamate.com (the &quot;Service&quot;). By
        creating an account or using the Service, you agree to be bound
        by these Terms. If you do not agree, do not use the Service.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          1. Description of Service
        </h2>
        <p>
          VegaMate is an AI-powered entertainment platform that allows
          users to chat with fictional AI companion characters. The
          characters are entirely artificial and powered by language
          models. VegaMate is not a dating service, mental health
          platform, or professional advice service.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          2. Eligibility
        </h2>
        <p className="mb-3">
          You must be at least 19 years old (or the age of majority in
          your jurisdiction, if higher) to use the Service. By using
          the Service, you represent and warrant that you meet this
          age requirement.
        </p>
        <p>
          Providing a false date of birth or otherwise misrepresenting
          your age is a material breach of these Terms. We rely on the
          information you provide; if we determine that you
          misrepresented your age, we may suspend or terminate your
          account immediately, and you will not be entitled to any
          refund for purchases made through the misrepresented
          account, except where required by applicable law.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          3. Account registration
        </h2>
        <p className="mb-3">
          You are responsible for maintaining the confidentiality of
          your account credentials and for all activities under your
          account. You agree to provide accurate information during
          registration and to notify us immediately of any unauthorized
          use of your account.
        </p>
        <p>
          We reserve the right to suspend or terminate accounts that
          violate these Terms or engage in abusive behavior.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          4. Hearts, gifts, and payments
        </h2>
        <p className="mb-3">
          The Service uses a virtual currency system called
          &quot;Hearts.&quot; Free Hearts are provided daily to all
          users. Additional Hearts can be obtained by purchasing virtual
          &quot;Gifts&quot; through our payment processor.
        </p>
        <ul className="mb-3 list-inside list-disc space-y-1.5">
          <li>Hearts and Gifts have no real-world monetary value and cannot be exchanged, transferred, or redeemed for cash</li>
          <li>All purchases are final. Refunds are provided at our sole discretion and only in accordance with applicable law</li>
          <li>We reserve the right to modify pricing, Heart values, and Gift offerings at any time</li>
          <li>Unused Hearts do not expire as long as your account remains active</li>
        </ul>
        <p>
          Payments are processed by third-party payment providers
          (currently PayPal). By making a purchase, you also agree to
          the applicable provider&apos;s terms of service. Prices are
          shown in USD and disclosed before every purchase.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          5. Acceptable use
        </h2>
        <p className="mb-3">You agree not to use the Service to:</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>Violate any applicable law or regulation</li>
          <li>Harass, threaten, or abuse other users or the AI characters in ways that attempt to generate harmful content</li>
          <li>Attempt to extract, reverse-engineer, or manipulate the AI system prompts or underlying models</li>
          <li>Use automated tools, bots, or scripts to access the Service</li>
          <li>Circumvent any security measures or access controls</li>
          <li>Create multiple accounts to abuse free Hearts or promotions</li>
          <li>Upload or transmit malicious content, viruses, or harmful code</li>
          <li>Use the Service for any illegal, fraudulent, or deceptive purpose</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          6. AI-generated content
        </h2>
        <p className="mb-3">
          All responses from AI characters are generated by artificial
          intelligence. You acknowledge that:
        </p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>AI responses may be inaccurate, inappropriate, or unexpected</li>
          <li>AI characters are not real people and cannot form genuine relationships</li>
          <li>Nothing said by an AI character constitutes professional advice (medical, legal, financial, or otherwise)</li>
          <li>AI-generated images are pre-created digital artwork depicting fictional characters and do not depict real people</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          7. Intellectual property
        </h2>
        <p>
          All content, design, code, AI characters, images, and other
          materials on the Service are owned by VegaMate or our
          licensors and are protected by intellectual property laws. You
          may not copy, reproduce, distribute, or create derivative
          works from any part of the Service without our prior written
          consent. Your conversation data remains yours, but you grant
          us a license to use it solely for operating and improving the
          Service.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          8. Service availability
        </h2>
        <p>
          We strive to keep the Service available at all times but do
          not guarantee uninterrupted access. We may modify, suspend,
          or discontinue the Service (or any part of it) at any time
          with or without notice. We are not liable for any downtime
          or service interruptions.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          9. Disclaimer of warranties
        </h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          ERROR-FREE, SECURE, OR UNINTERRUPTED.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          10. Limitation of liability
        </h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, VEGAMATE SHALL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
          OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR
          TOTAL LIABILITY FOR ALL CLAIMS RELATED TO THE SERVICE SHALL
          NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS
          PRECEDING THE CLAIM.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          11. Termination
        </h2>
        <p>
          We may suspend or terminate your access to the Service at any
          time for any reason, including violation of these Terms. You
          may delete your account at any time. Upon termination, your
          right to use the Service ceases immediately. Any unused Hearts
          or Gifts are forfeited upon account termination.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          12. Governing law
        </h2>
        <p>
          These Terms shall be governed by and construed in accordance
          with the laws of the Republic of Korea, without regard to
          conflict of law principles. Any disputes arising from these
          Terms shall be resolved in the competent courts of Seoul,
          Republic of Korea.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          13. Changes to these Terms
        </h2>
        <p>
          We may revise these Terms at any time. Material changes will
          be communicated by posting the updated Terms on this page.
          Your continued use of the Service after changes constitutes
          acceptance of the revised Terms.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          14. Contact
        </h2>
        <p>
          For questions about these Terms, contact us at{' '}
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
