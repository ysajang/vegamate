import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Disclaimer & Safety',
  description: 'VegaMate service disclaimer, safety information, and mental health resources.',
};

export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      <h1 className="mb-8 text-2xl font-bold text-foreground">
        Disclaimer &amp; Safety
      </h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          VegaMate is an AI entertainment service
        </h2>
        <p className="mb-3">
          VegaMate provides AI-powered companion characters for entertainment
          and casual conversation. The characters are fictional and powered by
          artificial intelligence. They are not real people.
        </p>
        <p>
          VegaMate is not a mental health service, therapy platform, crisis
          intervention tool, or substitute for professional medical advice.
          Nothing said by an AI character should be interpreted as professional
          guidance of any kind.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Mental health &amp; safety
        </h2>
        <p className="mb-3">
          We care about our users&apos; wellbeing. Our AI characters are
          designed to respond with empathy and warmth when users express
          distress. However:
        </p>
        <ul className="mb-3 list-inside list-disc space-y-1.5">
          <li>
            AI characters will <strong>never</strong> encourage, endorse, or
            provide information related to self-harm or suicide
          </li>
          <li>
            AI characters will <strong>never</strong> act as a substitute for
            professional mental health support
          </li>
          <li>
            When signs of distress are detected, AI characters will gently
            encourage users to seek professional help
          </li>
          <li>
            Crisis helpline information is provided when severe distress
            signals are detected
          </li>
        </ul>
        <p>
          If you or someone you know is struggling with mental health, please
          reach out to a qualified professional or contact one of the resources
          below.
        </p>
      </section>

      <section className="mb-10 rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          💙 Crisis resources (24/7)
        </h2>
        <ul className="space-y-2">
          <li>
            <strong>🇺🇸 USA:</strong> 988 Suicide &amp; Crisis Lifeline
            &mdash; call or text <strong>988</strong>
          </li>
          <li>
            <strong>🇰🇷 Korea:</strong> 자살예방상담전화{' '}
            <strong>1393</strong> / 정신건강위기상담전화{' '}
            <strong>1577-0199</strong>
          </li>
          <li>
            <strong>🇬🇧 UK:</strong> Samaritans &mdash; call{' '}
            <strong>116 123</strong>
          </li>
          <li>
            <strong>🌍 International:</strong>{' '}
            <a
              href="https://findahelpline.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              findahelpline.com
            </a>
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Content &amp; age restriction
        </h2>
        <p className="mb-3">
          VegaMate is intended for users aged 18 and older. By using
          VegaMate, you confirm that you meet the minimum age requirement
          in your jurisdiction.
        </p>
        <p>
          AI-generated images are pre-created and curated. No real persons are
          depicted. All character likenesses are entirely fictional.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          No guarantees
        </h2>
        <p>
          VegaMate is provided &quot;as is&quot; without warranties of any
          kind. We do not guarantee the accuracy, appropriateness, or
          reliability of AI-generated responses. Users interact with AI
          characters at their own discretion.
        </p>
      </section>

      <footer className="border-t border-border/30 pt-6 text-xs text-muted-foreground/60">
        Last updated: May 2026
      </footer>
    </main>
  );
}
