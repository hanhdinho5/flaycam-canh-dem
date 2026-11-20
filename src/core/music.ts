import { serverPort } from './net';

export function createBackgroundMusic(stage: HTMLElement) {
  const audio = new Audio();
  audio.loop = true;
  audio.volume = 0.35;
  let current: string | null = null;

  const button = document.createElement('button');
  button.textContent = 'Bật nhạc';
  button.hidden = true;
  Object.assign(button.style, {
    position: 'absolute', bottom: '12px', right: '12px', zIndex: '5', cursor: 'pointer',
  });
  stage.append(button);

  async function play(track: string) {
    try {
      await audio.play();
      if (current === track) button.hidden = true;
    } catch (error) {
      if (current === track && error instanceof DOMException && error.name === 'NotAllowedError') {
        button.hidden = false;
      }
    }
  }

  button.onclick = () => { if (current) void play(current); };
  return (track: string | null) => {
    if (track === current) return;
    current = track;
    button.hidden = true;
    if (!track) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    const url = new URL(location.href);
    url.port = String(serverPort);
    url.pathname = `/music/${encodeURIComponent(track)}`;
    url.search = '';
    url.hash = '';
    audio.src = url.href;
    void play(track);
  };
}
