console.log('hero-video-controls.js: Loaded');

function initHeroVideoControls() {
  console.log('hero-video-controls: Initializing all hero sections...');

  // Find all hero sections with videos
  const heroSections = document.querySelectorAll('[id^="BlessHero-"]');
  console.log('hero-video-controls: Found', heroSections.length, 'hero sections');

  heroSections.forEach((heroSection) => {
    console.log('hero-video-controls: Processing section:', heroSection.id);

    const focusWrapper = heroSection.querySelector('.bless-hero__focus-wrapper');
    console.log('  - Focus wrapper found?', !!focusWrapper);

    if (!focusWrapper) {
      console.log('  - Skipping, no focus wrapper');
      return;
    }

    const focusVideo = focusWrapper.querySelector('.bless-hero__focus-video');
    const controlBar = focusWrapper.querySelector('.bless-hero__control-bar');

    console.log('  - Video element found?', focusVideo instanceof HTMLMediaElement);
    console.log('  - Control bar found?', !!controlBar);
    console.log('  - Video readyState:', focusVideo?.readyState);

    if (!(focusVideo instanceof HTMLMediaElement) || !controlBar) {
      console.log('  - Skipping, missing video or control bar');
      return;
    }

    const playButton = controlBar.querySelector('[data-control="play"]');
    const muteButton = controlBar.querySelector('[data-control="mute"]');

    console.log('  - Play button found?', !!playButton);
    console.log('  - Mute button found?', !!muteButton);

    if (!playButton || !muteButton) {
      console.log('  - Skipping, missing buttons');
      return;
    }

    const playIcon = playButton.querySelector('[aria-hidden="true"]');
    const muteGlyph = muteButton.querySelector('.bless-hero__sound-glyph');
    const muteIconImg = muteButton.querySelector('.bless-hero__sound-icon');

    const syncPlayState = () => {
      if (!playIcon) return;
      if (focusVideo.paused) {
        playIcon.textContent = '►';
        playButton.setAttribute('aria-label', 'Play');
        playButton.setAttribute('title', 'Play');
      } else {
        playIcon.textContent = '❚❚';
        playButton.setAttribute('aria-label', 'Pause');
        playButton.setAttribute('title', 'Pause');
      }
    };

    const syncMuteState = () => {
      const isMuted = focusVideo.muted;
      muteButton.classList.toggle('is-muted', isMuted);
      muteButton.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
      muteButton.setAttribute('title', isMuted ? 'Unmute' : 'Mute');
      if (muteGlyph) {
        muteGlyph.textContent = isMuted ? '🔇' : '🔊';
      }
      if (muteIconImg) {
        muteIconImg.style.opacity = isMuted ? '0.7' : '1';
      }
    };

    // Ensure video is unmuted
    focusVideo.muted = false;
    focusVideo.defaultMuted = false;
    focusVideo.removeAttribute('muted');

    const initialise = () => {
      console.log('  - Video initialized, readyState:', focusVideo.readyState);
      focusVideo.pause();
      focusVideo.currentTime = 0;
      syncPlayState();
      syncMuteState();
    };

    // Initialize when ready
    if (focusVideo.readyState >= 2) {
      initialise();
    } else {
      console.log('  - Waiting for video metadata...');
      focusVideo.addEventListener('loadedmetadata', initialise, { once: true });
    }

    // Play button click handler
    console.log('  - Attaching play button listener');
    playButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('=== PLAY BUTTON CLICKED ===');
      console.log('Video paused:', focusVideo.paused, 'readyState:', focusVideo.readyState);

      if (focusVideo.paused) {
        const playPromise = focusVideo.play();
        console.log('Attempting play, promise:', !!playPromise);

        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              console.log('✓ Video play succeeded');
              syncPlayState();
            })
            .catch((error) => {
              console.error('✗ Video play failed:', error.name, error.message);
              syncPlayState();
            });
        } else {
          console.log('No play promise returned');
          syncPlayState();
        }
      } else {
        console.log('Video is playing, pausing...');
        focusVideo.pause();
        syncPlayState();
      }
    });

    // Mute button click handler
    muteButton.addEventListener('click', () => {
      focusVideo.muted = !focusVideo.muted;
      console.log('Mute toggled:', focusVideo.muted);
      syncMuteState();
    });

    // Video event listeners
    focusVideo.addEventListener('play', syncPlayState);
    focusVideo.addEventListener('pause', syncPlayState);
    focusVideo.addEventListener('ended', () => {
      focusVideo.pause();
      focusVideo.currentTime = 0;
      syncPlayState();
    });
    focusVideo.addEventListener('error', (e) => {
      console.error('Video error:', e.target.error);
    });

    console.log('  ✓ Section initialized successfully');
  });
}

// Initialize immediately
initHeroVideoControls();

// Also initialize after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeroVideoControls);
}

// Also try after a delay for dynamic content
setTimeout(initHeroVideoControls, 100);
setTimeout(initHeroVideoControls, 500);
