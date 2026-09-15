import { FEATURES } from '../../config/app.js';

const Footer = ({ onOpenFeedback, onNavigate, currentView }) => {
  const currentYear = new Date().getFullYear();

  // Kristin Tiers is unlisted: the only way in is this footer link, and it
  // only appears while you're on My Rankings (reached from the profile
  // dropdown). Nothing in the header or the nav points at it.
  const showKristinTiers = FEATURES.kristinTiers && currentView === 'my-rankings';

  // Small helper that intercepts a click, prevents the anchor default,
  // and routes to the given view key. Using anchors (instead of plain
  // buttons) keeps the existing footer look without needing new CSS.
  const navTo = (viewKey) => (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(viewKey);
    // Scroll to top so users don't land mid-page when they click a footer link
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-section footer-brand">
          <div className="footer-logo">I'M TOURN</div>
          <p className="footer-tagline">
            Create, compete, and crown champions with brackets, prediction pools, and head-to-head
            rankings.
          </p>
        </div>

        <div className="footer-section">
          <h4>Features</h4>
          <ul>
            <li>
              <a href="/?view=pools" onClick={navTo('pools')}>
                Bracket Pools
              </a>
            </li>
            {FEATURES.predictions && (
              <li>
                <a href="/?view=prediction-pools" onClick={navTo('prediction-pools')}>
                  Prediction Pools
                </a>
              </li>
            )}
            <li>
              <a href="/?view=rankings" onClick={navTo('rankings')}>
                Rankings
              </a>
            </li>
            <li>
              <a href="/?view=weekly" onClick={navTo('weekly')}>
                Weekly Brackets
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Support</h4>
          <ul>
            <li>
              <button type="button" className="footer-action" onClick={onOpenFeedback}>
                Report a Bug
              </button>
            </li>
            <li>
              <button type="button" className="footer-action" onClick={onOpenFeedback}>
                Request a Feature
              </button>
            </li>
            <li>
              <button type="button" className="footer-action" onClick={onOpenFeedback}>
                Contact Us
              </button>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Legal</h4>
          <ul>
            <li>
              <a href="/?view=privacy" onClick={navTo('privacy')}>
                Privacy Policy
              </a>
            </li>
            <li>
              <a href="/?view=terms" onClick={navTo('terms')}>
                Terms of Service
              </a>
            </li>
            {showKristinTiers && (
              <li>
                <a href="/?view=kristin-tiers" onClick={navTo('kristin-tiers')}>
                  Kristin Tiers
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {currentYear} I'm Tourn. All rights reserved.</p>
        <p className="footer-credits">Made with 🏆 for tournament lovers</p>
      </div>
    </footer>
  );
};

export default Footer;
