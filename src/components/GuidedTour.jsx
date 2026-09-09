import { useState } from 'react';

const GuidedTour = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Welcome to I'm Tourn! 🏆",
      content: "We're excited to have you! Let's take a quick tour of what you can do here.",
      icon: '👋',
    },
    {
      title: 'Browse & Create Brackets',
      content:
        'Explore brackets created by the community or create your own custom bracket with up to 64 entries. Topics range from movies to sports to food!',
      icon: '📋',
    },
    {
      title: 'Bracket Pools',
      content:
        'Compete with friends! Create a bracket pool, share the join code, and see who can predict the most winners. Perfect for March Madness, playoffs, and more.',
      icon: '🏀',
    },
    {
      title: 'Weekly Bracket',
      content:
        'Vote daily on the community bracket! A new bracket is featured each week, and your votes help determine the champion.',
      icon: '📅',
    },
    {
      title: "You're All Set!",
      content:
        "That's the basics! Start by browsing brackets or creating your first pool. Have fun competing!",
      icon: '🎉',
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = steps[currentStep];

  return (
    <div className="tour-overlay">
      <div className="tour-modal">
        <div className="tour-progress">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`tour-progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>

        <div className="tour-icon">{step.icon}</div>
        <h2 className="tour-title">{step.title}</h2>
        <p className="tour-content">{step.content}</p>

        <div className="tour-actions">
          {currentStep < steps.length - 1 && (
            <button className="tour-skip-btn" onClick={handleSkip}>
              Skip Tour
            </button>
          )}
          <button className="tour-next-btn" onClick={handleNext}>
            {currentStep === steps.length - 1 ? 'Get Started!' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuidedTour;
