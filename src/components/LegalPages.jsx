// src/components/LegalPages.jsx
//
// Privacy Policy and Terms of Service pages.
//
// ============================================================================
// IMPORTANT DISCLAIMER FROM CLAUDE:
// ============================================================================
// These documents are TEMPLATES written by an AI assistant, NOT legal advice.
// They cover the common bases for a consumer web app of this kind (user
// accounts, public content, image uploads, no payments) and are suitable as
// a starting point for a small launch. Before you scale up significantly,
// monetize, collect payment information, expand internationally, or face
// any regulatory attention, YOU SHOULD HAVE A REAL LAWYER REVIEW THESE
// AND REPLACE OR UPDATE THEM AS NEEDED.
//
// Things I've left as placeholders that YOU must fill in before going live:
//   - [CONTACT EMAIL] — replace with your support/legal contact
//   - [EFFECTIVE DATE] — replace with the date you publish these
//   - [LEGAL NAME] — replace with your business/legal name if different
//     from "I'm Tourn"
//   - [JURISDICTION] — I assumed U.S. / Virginia based on earlier context.
//     Update if your business is incorporated elsewhere.
//
// I've also written these in plain English rather than dense legalese
// because (a) users actually reading them is better than users ignoring
// them, and (b) the legal value of walls of jargon is overstated for a
// small consumer product. A lawyer may want to tighten the language
// later; that's fine and expected.
// ============================================================================

import React from 'react';

// ============================================================================
// Shared layout component
// ============================================================================

const LegalPageLayout = ({ title, effectiveDate, children }) => (
  <div className="home-container legal-page">
    <div className="page-header">
      <h1>{title}</h1>
      <p className="legal-effective-date">Effective: {effectiveDate}</p>
    </div>
    <div className="legal-content">
      {children}
    </div>
  </div>
);

// ============================================================================
// Privacy Policy
// ============================================================================

export const PrivacyPolicyPage = () => {
  return (
    <LegalPageLayout title="Privacy Policy" effectiveDate="April 10, 2026">
      <p className="legal-intro">
        This Privacy Policy explains how I'm Tourn ("we," "us," or "our")
        collects, uses, and shares information when you use our website and
        services. We've tried to write this in plain English — if anything
        is unclear, reach out at <a href="mailto:jaredellis533@gmail.com">jaredellis533@gmail.com</a>.
      </p>

      <h2>What we collect</h2>

      <p>
        <strong>Account information.</strong> When you sign up, we collect the
        email address and display name you provide through Firebase
        Authentication. If you sign up using a third-party provider like
        Google, we receive the basic profile information they share with us.
      </p>

      <p>
        <strong>Content you create.</strong> Brackets, ranking lists, prediction
        pools, descriptions, comments, uploaded images, and your votes and
        picks are stored so the service can work. Most of this content is
        public by design — other users can see brackets and rankings you
        create and share.
      </p>

      <p>
        <strong>Usage data.</strong> Our hosting provider and Firebase may log
        technical information about your requests (IP address, browser, pages
        visited, timestamps) to keep the service running, prevent abuse, and
        diagnose issues. We don't use this information to build advertising
        profiles.
      </p>

      <p>
        <strong>What we don't collect.</strong> We don't ask for your real
        name, phone number, address, date of birth, or payment information.
        I'm Tourn is currently free and has no payment processing.
      </p>

      <h2>How we use your information</h2>

      <ul>
        <li>To run the core features of the service (showing your content to
          other users, saving your progress, tallying votes)</li>
        <li>To let other users see your display name and content when you
          share it</li>
        <li>To communicate with you about your account, service changes, or
          responses to feedback you send us</li>
        <li>To protect the service from abuse, spam, or technical problems</li>
      </ul>

      <p>
        We do <strong>not</strong> sell your information, rent it to
        advertisers, or use it to target ads to you.
      </p>

      <h2>Who we share information with</h2>

      <p>
        <strong>Other users of I'm Tourn.</strong> Content you create is
        visible to other users when you publish or share it. Your display
        name appears next to brackets, rankings, and votes you create.
      </p>

      <p>
        <strong>Service providers.</strong> We use Google Firebase for
        authentication, database, and file storage, and Netlify for web
        hosting. These providers process data on our behalf under their own
        privacy commitments. We don't share your information with any other
        third parties unless required by law.
      </p>

      <p>
        <strong>Legal requirements.</strong> We may disclose information if
        we're required to by valid legal process, or if we believe disclosure
        is necessary to protect someone's safety, investigate fraud, or
        enforce our Terms of Service.
      </p>

      <h2>Cookies and tracking</h2>

      <p>
        We use a small number of cookies and browser storage mechanisms to
        keep you signed in, remember your preferences, and save your progress
        on features like ranking votes. We don't use third-party advertising
        or tracking cookies.
      </p>

      <h2>Your choices</h2>

      <p>
        <strong>Edit or delete your content.</strong> You can delete brackets
        and rankings you've created from your profile. Deleting them removes
        them from the service and from our backups within a reasonable time.
      </p>

      <p>
        <strong>Delete your account.</strong> If you want to delete your
        account entirely, email us at <a href="mailto:jaredellis533@gmail.com">jaredellis533@gmail.com</a>.
        We'll remove your account and the content associated with it. Some
        information may remain in backups for a limited time before being
        purged.
      </p>

      <p>
        <strong>Opt out of communications.</strong> We don't currently send
        marketing email. If that changes, we'll include an unsubscribe link.
      </p>

      <h2>Children</h2>

      <p>
        I'm Tourn is not directed at children under 13, and we don't
        knowingly collect personal information from children under 13. If you
        believe a child under 13 has provided us with personal information,
        please contact us and we'll delete it.
      </p>

      <h2>Data security</h2>

      <p>
        We rely on Firebase and Netlify for industry-standard security
        practices including encryption in transit and at rest. No online
        service can guarantee perfect security, but we take reasonable steps
        to protect your information and will notify affected users in the
        event of a material data breach as required by applicable law.
      </p>

      <h2>International users</h2>

      <p>
        I'm Tourn is operated from the United States. If you use the service
        from outside the U.S., you understand that your information will be
        processed in the United States, which may have data protection laws
        different from those in your country.
      </p>

      <h2>Changes to this policy</h2>

      <p>
        We may update this Privacy Policy from time to time. If we make
        material changes, we'll update the "Effective" date at the top and,
        for significant changes, let you know through a notice on the site
        or by email.
      </p>

      <h2>Contact us</h2>

      <p>
        If you have questions about this Privacy Policy or how your
        information is handled, email us at{' '}
        <a href="mailto:jaredellis533@gmail.com">jaredellis533@gmail.com</a>.
      </p>
    </LegalPageLayout>
  );
};

// ============================================================================
// Terms of Service
// ============================================================================

export const TermsOfServicePage = () => {
  return (
    <LegalPageLayout title="Terms of Service" effectiveDate="April 10, 2026">
      <p className="legal-intro">
        Welcome to I'm Tourn. These Terms of Service ("Terms") are the rules
        for using our website and services. By creating an account or using
        the site, you agree to these Terms. If you don't agree, please don't
        use the service.
      </p>

      <h2>What I'm Tourn is</h2>

      <p>
        I'm Tourn is a platform for creating tournament brackets, prediction
        pools, and ranking lists, and sharing them with other users. The
        service is provided by I'm Tourn and is free to use.
      </p>

      <h2>Your account</h2>

      <p>
        You need an account to create brackets, vote in pools, or submit
        rankings. You're responsible for keeping your login credentials
        secure and for everything that happens under your account. If you
        think your account has been compromised, contact us immediately.
      </p>

      <p>
        You must be at least 13 years old to use I'm Tourn. If you're between
        13 and the age of majority in your jurisdiction, you should have a
        parent or guardian's permission to use the service.
      </p>

      <h2>Content you create</h2>

      <p>
        <strong>You own your content.</strong> Brackets, rankings, images,
        descriptions, and other content you create remain yours. By posting
        content to I'm Tourn, you grant us a non-exclusive, worldwide,
        royalty-free license to host, display, reproduce, and distribute
        that content in connection with operating the service. This license
        ends when you delete the content or close your account, except to
        the extent copies remain in backups or have been shared by other
        users.
      </p>

      <p>
        <strong>You're responsible for your content.</strong> Don't post
        anything that:
      </p>

      <ul>
        <li>Infringes someone else's copyright, trademark, or other rights
          (including using images you don't have permission to use)</li>
        <li>Is illegal, defamatory, harassing, threatening, or hateful</li>
        <li>Contains private information about others without their
          permission</li>
        <li>Contains malware, spam, or links intended to harm users</li>
        <li>Is sexually explicit or otherwise inappropriate for a general
          audience</li>
        <li>Impersonates another person or misrepresents your identity</li>
      </ul>

      <p>
        We reserve the right to remove content that violates these rules and
        to suspend or terminate accounts that repeatedly or seriously violate
        them.
      </p>

      <h2>Acceptable use</h2>

      <p>
        Please don't:
      </p>

      <ul>
        <li>Attempt to break, reverse-engineer, or overload the service</li>
        <li>Use bots, scrapers, or automated tools to interact with the site
          in ways that interfere with normal use</li>
        <li>Create multiple accounts to manipulate votes or gain unfair
          advantages</li>
        <li>Attempt to access accounts, data, or areas of the service you're
          not authorized to access</li>
      </ul>

      <h2>Intellectual property</h2>

      <p>
        The I'm Tourn name, logo, website design, and software are owned by
        us and are protected by copyright and trademark law. These Terms
        don't give you a license to use them outside of normal use of the
        service.
      </p>

      <h2>Copyright complaints</h2>

      <p>
        If you believe content on I'm Tourn infringes your copyright, please
        contact us at <a href="mailto:jaredellis533@gmail.com">jaredellis533@gmail.com</a>{' '}
        with: (1) a description of the copyrighted work, (2) where the
        infringing content is located on the site, (3) your contact
        information, (4) a statement that you have a good faith belief the
        use is unauthorized, and (5) a statement under penalty of perjury
        that the information is accurate and you're authorized to act on
        behalf of the copyright owner.
      </p>

      <h2>Service changes and availability</h2>

      <p>
        We may change, suspend, or discontinue any part of the service at
        any time, with or without notice. We try not to break things, but
        we can't promise the service will always be available or bug-free.
      </p>

      <h2>Disclaimers</h2>

      <p>
        I'm Tourn is provided "as is" without warranties of any kind, either
        express or implied, including warranties of merchantability, fitness
        for a particular purpose, or non-infringement. We don't guarantee
        that the service will be uninterrupted, secure, or error-free, or
        that content will be accurate or reliable.
      </p>

      <h2>Limitation of liability</h2>

      <p>
        To the maximum extent permitted by law, I'm Tourn and its operators
        are not liable for any indirect, incidental, special, consequential,
        or punitive damages arising out of your use of the service, even if
        we've been told about the possibility of those damages. Our total
        liability to you for any claim arising out of these Terms or the
        service is limited to one hundred U.S. dollars ($100).
      </p>

      <h2>Indemnification</h2>

      <p>
        You agree to defend, indemnify, and hold harmless I'm Tourn and its
        operators from any claims, damages, or expenses (including reasonable
        attorneys' fees) arising out of your use of the service, your
        content, or your violation of these Terms.
      </p>

      <h2>Termination</h2>

      <p>
        You can stop using I'm Tourn at any time. We may suspend or terminate
        your account at any time, with or without notice, if we believe you've
        violated these Terms or for any other reason at our discretion.
        Sections of these Terms that by their nature should survive
        termination (ownership, disclaimers, liability limits, dispute
        resolution) will survive.
      </p>

      <h2>Governing law and disputes</h2>

      <p>
        These Terms are governed by the laws of Massachusetts, USA, without
        regard to conflict-of-laws principles. Any disputes arising out of
        these Terms or the service will be resolved in the state or federal
        courts located in Massachusetts, USA, and you consent to the jurisdiction
        of those courts.
      </p>

      <h2>Changes to these Terms</h2>

      <p>
        We may update these Terms from time to time. If we make material
        changes, we'll update the "Effective" date at the top and, for
        significant changes, let you know through a notice on the site or by
        email. Continuing to use the service after changes take effect means
        you accept the new Terms.
      </p>

      <h2>Contact us</h2>

      <p>
        Questions about these Terms? Email us at{' '}
        <a href="mailto:jaredellis533@gmail.com">jaredellis533@gmail.com</a>.
      </p>
    </LegalPageLayout>
  );
};
