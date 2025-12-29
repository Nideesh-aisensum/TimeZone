// Background Music Manager
// Plays background music continuously across welcome screens at 30% volume
// Works both standalone and inside kiosk-shell iframe

(function () {
    const MUSIC_VOLUME = 0.3; // 30% volume
    const DUCKED_VOLUME = 0.1; // 10% volume when other sounds play
    const MUSIC_SRC = 'bg-music.wav';
    const STORAGE_KEY = 'tizo_bg_music_time';
    const FADE_DURATION = 150; // ms for volume fade transitions

    // Check if we're inside the kiosk shell iframe AND if shell has music playing
    function isShellMusicActive() {
        try {
            if (window.parent !== window && window.parent.ShellMusic) {
                const shellAudio = window.parent.ShellMusic.getAudio();
                // Only defer to shell if it actually has audio and it's playing or ready
                return shellAudio && (shellAudio.readyState >= 2 || !shellAudio.paused);
            }
        } catch (e) {
            // Cross-origin error, not in shell
        }
        return false;
    }

    // Pages where music should NOT play (screensaver)
    const EXCLUDED_PAGES = [];

    // Check if current page is excluded
    function isExcludedPage() {
        const path = window.location.pathname.toLowerCase();
        return EXCLUDED_PAGES.some(page => path.includes(page));
    }

    // Active external sounds counter
    const activeSounds = new Set();
    let soundIdCounter = 0;

    // Smooth volume transition
    function fadeVolume(audio, targetVolume, duration = FADE_DURATION) {
        if (!audio) return;
        const startVolume = audio.volume;
        const volumeDiff = targetVolume - startVolume;
        const startTime = performance.now();

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - (1 - progress) * (1 - progress);
            let newVolume = startVolume + (volumeDiff * easeProgress);
            newVolume = Math.max(0, Math.min(1, newVolume));
            audio.volume = newVolume;

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    // Ducking logic - handles both shell and local scenarios
    function duckBackgroundMusic(element) {
        // Try to duck shell music first
        try {
            if (window.parent !== window && window.parent.ShellMusic) {
                const soundId = 'sound_' + (++soundIdCounter);
                element._shellSoundId = soundId;

                window.parent.postMessage({
                    type: 'duckMusic',
                    action: 'start',
                    soundId: soundId
                }, '*');

                if (!element._shellDuckListenerAttached) {
                    const onSoundEnd = () => {
                        try {
                            window.parent.postMessage({
                                type: 'duckMusic',
                                action: 'end',
                                soundId: element._shellSoundId
                            }, '*');
                        } catch (e) { }
                    };

                    element.addEventListener('ended', onSoundEnd);
                    element.addEventListener('pause', onSoundEnd);
                    element._shellDuckListenerAttached = true;
                }
                return;
            }
        } catch (e) { }

        // Local ducking for standalone pages
        const bgAudio = document.getElementById('background-music');
        if (!bgAudio) return;

        if (activeSounds.size === 0) {
            fadeVolume(bgAudio, DUCKED_VOLUME);
        }

        activeSounds.add(element);

        if (!element._duckListenerAttached) {
            const onSoundEnd = () => {
                activeSounds.delete(element);
                if (activeSounds.size === 0 && bgAudio) {
                    fadeVolume(bgAudio, MUSIC_VOLUME);
                }
            };

            element.addEventListener('ended', onSoundEnd);
            element.addEventListener('pause', onSoundEnd);
            element._duckListenerAttached = true;
        }
    }

    // Monkey patch to detect other sounds
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        if (this.id !== 'background-music' && this.id !== 'shell-background-music' && !this.muted && this.volume > 0) {
            if (!this.classList.contains('video-bg')) {
                duckBackgroundMusic(this);
            }
        }
        return originalPlay.apply(this, arguments);
    };

    // Initialize background music
    function initBackgroundMusic() {
        // Check after a small delay if shell music is active
        // This gives the shell time to initialize its music
        setTimeout(() => {
            if (isShellMusicActive()) {
                console.log('[BackgroundMusic] Shell music is active, using shell music');
                return;
            }

            // Shell music not active, create local audio
            createLocalAudio();
        }, 100);
    }

    function createLocalAudio() {
        // Don't play on excluded pages
        if (isExcludedPage()) {
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }

        // Check if already exists
        if (document.getElementById('background-music')) {
            console.log('[BackgroundMusic] Audio already exists');
            return;
        }

        console.log('[BackgroundMusic] Creating local audio element');

        const audio = document.createElement('audio');
        audio.id = 'background-music';
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 0;
        audio.src = MUSIC_SRC;
        audio.style.display = 'none';

        const savedTime = sessionStorage.getItem(STORAGE_KEY);

        audio.addEventListener('canplaythrough', function onReady() {
            audio.removeEventListener('canplaythrough', onReady);

            if (savedTime) {
                audio.currentTime = parseFloat(savedTime);
            }

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    fadeVolume(audio, MUSIC_VOLUME, 200);
                    console.log('[BackgroundMusic] Audio playing');
                }).catch(function (error) {
                    console.log('[BackgroundMusic] Autoplay prevented, waiting for interaction');

                    function playOnInteraction() {
                        audio.play().then(function () {
                            fadeVolume(audio, MUSIC_VOLUME, 200);
                            document.removeEventListener('click', playOnInteraction);
                            document.removeEventListener('touchstart', playOnInteraction);
                            console.log('[BackgroundMusic] Audio started on interaction');
                        }).catch(function (e) {
                            console.log('[BackgroundMusic] Still cannot play:', e);
                        });
                    }

                    document.addEventListener('click', playOnInteraction);
                    document.addEventListener('touchstart', playOnInteraction);
                });
            }
        }, { once: true });

        // Error handling
        audio.addEventListener('error', function (e) {
            console.error('[BackgroundMusic] Audio error:', e);
        });

        window.addEventListener('beforeunload', function () {
            if (audio && !audio.paused) {
                sessionStorage.setItem(STORAGE_KEY, audio.currentTime.toString());
            }
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden' && audio && !audio.paused) {
                sessionStorage.setItem(STORAGE_KEY, audio.currentTime.toString());
            }
        });

        setInterval(function () {
            if (audio && !audio.paused) {
                sessionStorage.setItem(STORAGE_KEY, audio.currentTime.toString());
            }
        }, 500);

        document.body.appendChild(audio);
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBackgroundMusic);
    } else {
        initBackgroundMusic();
    }
})();
