// Live camera for the Screen tab: it opens like the phone's own camera app (back camera,
// full screen), not behind a button. The still is a frame from the stream, handed to the same
// quality check and model as an uploaded file. No frame is stored or sent anywhere here.
// If the camera cannot open (permission off, no camera, old WebView) the screen falls back to
// the phone's camera picker, so screening is never blocked by this.
import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'starting' | 'live' | 'denied' | 'unavailable';

export function useCamera(active: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [visible, setVisible] = useState(typeof document === 'undefined' || document.visibilityState !== 'hidden');

  // Let go of the camera when the app is in the background (battery, and the OS light goes off).
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    if (!active || !visible) return;
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md?.getUserMedia) { setState('unavailable'); return; }
    let live = true;
    let stream: MediaStream | null = null;
    setState('starting');
    md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!live) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream = s;
        const v = video.current;
        if (v) { v.srcObject = s; void Promise.resolve(v.play?.()).catch(() => {}); }
        setState('live');
      })
      .catch((e: { name?: string }) => {
        if (live) setState(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unavailable');
      });
    return () => { live = false; stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [active, visible]);

  /** One still from the live picture, or null if the camera is not showing yet. */
  const capture = useCallback(async (): Promise<File | null> => {
    const v = video.current;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/jpeg', 0.92));
    return blob ? new File([blob], 'capture.jpg', { type: 'image/jpeg' }) : null;
  }, []);

  return { video, state, capture };
}
